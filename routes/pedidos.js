const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const { registrarVendaNoCaixa } = require("../services/caixaService");

const router = express.Router();
const prisma = new PrismaClient();

const STATUS_COM_ESTOQUE_RESERVADO = ["reservado", "agendado", "confirmado"];
const STATUS_FINAIS = ["cancelado", "entregue"];

function lojaId(req) {
  return req.loja.id;
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numero = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(numero) ? numero : null;
}

function numero(value, fallback = 0) {
  return toNumberOrNull(value) ?? fallback;
}

function itemManual(item) {
  if (item.manual || item.tipo === "manual") return true;
  if (item.variacaoProdutoId === null || item.variacaoProdutoId === undefined || item.variacaoProdutoId === "") {
    return true;
  }
  return String(item.variacaoProdutoId).startsWith("manual-");
}

function montarItensPedido(itens) {
  return itens.map((item) => {
    const quantidade = Number(item.quantidade);
    const precoUnitario = toNumberOrNull(item.precoUnitario ?? item.preco ?? item.valorVenda);

    if (itemManual(item)) {
      return {
        manual: true,
        nomeManual: String(item.nomeManual || item.nome || "").trim(),
        numeracaoManual: String(item.numeracaoManual || item.numeracao || "").trim() || null,
        quantidade,
        precoUnitario,
        custoUnitario: numero(item.custoUnitario ?? item.valorCusto),
        outrosCustos: numero(item.outrosCustos),
      };
    }

    return {
      manual: false,
      variacaoProdutoId: Number(item.variacaoProdutoId),
      quantidade,
      precoUnitario,
    };
  });
}

function includePedidoCompleto() {
  return {
    cliente: true,
    itens: { include: { variacaoProduto: { include: { produto: true } } } },
  };
}

function includeVendaCompleta() {
  return {
    cliente: true,
    itens: { include: { variacaoProduto: { include: { produto: true } } } },
  };
}

router.post("/", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const {
      clienteId,
      observacoes,
      dataEntrega,
      horarioEntrega,
      tipoEntrega,
      endereco,
      taxaEntrega,
      produtos: produtosDoBody,
      itens: itensDoBody,
    } = req.body;

    const produtos = montarItensPedido(produtosDoBody || itensDoBody || []);
    if (!produtos.length) return res.status(400).json({ error: "Nenhum produto informado." });

    const itemInvalido = produtos.find((item) => {
      if (!Number.isInteger(item.quantidade) || item.quantidade <= 0) return true;
      if (item.manual) {
        return !item.nomeManual || item.precoUnitario === null || item.precoUnitario <= 0 || item.custoUnitario < 0 || item.outrosCustos < 0;
      }
      return !Number.isInteger(item.variacaoProdutoId);
    });
    if (itemInvalido) return res.status(400).json({ error: "Itens do pedido invalidos." });

    const novaDataEntrega = dataEntrega ? new Date(dataEntrega) : null;
    const clienteIdNumerico = toNumberOrNull(clienteId);
    const taxaEntregaPedido = tipoEntrega === "entrega" ? Math.max(numero(taxaEntrega), 0) : 0;

    const pedido = await prisma.$transaction(async (tx) => {
      if (clienteIdNumerico) {
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteIdNumerico, lojaId: lojaId(req) },
        });
        if (!cliente) throw new Error("Cliente nao encontrado nesta loja.");
      }

      const itensComPreco = [];
      for (const item of produtos) {
        if (item.manual) {
          const precoUnitario = item.precoUnitario;
          itensComPreco.push({
            variacaoProdutoId: null,
            nomeManual: item.nomeManual,
            numeracaoManual: item.numeracaoManual,
            quantidade: item.quantidade,
            precoUnitario,
            custoUnitario: item.custoUnitario,
            outrosCustos: item.outrosCustos,
            subtotal: item.quantidade * precoUnitario,
          });
          continue;
        }

        const variacao = await tx.variacaoProduto.findFirst({
          where: {
            id: item.variacaoProdutoId,
            produto: { lojaId: lojaId(req) },
          },
          include: { produto: true },
        });
        if (!variacao) throw new Error(`Variacao ${item.variacaoProdutoId} nao encontrada.`);

        const reserva = await tx.variacaoProduto.updateMany({
          where: {
            id: item.variacaoProdutoId,
            estoque: { gte: item.quantidade },
            produto: { lojaId: lojaId(req) },
          },
          data: { estoque: { decrement: item.quantidade } },
        });

        if (reserva.count === 0) {
          throw new Error(`Estoque insuficiente para ${variacao.produto.nome} (${variacao.numeracao}).`);
        }

        const precoUnitario = item.precoUnitario ?? variacao.produto.preco;
        itensComPreco.push({
          variacaoProdutoId: variacao.id,
          quantidade: item.quantidade,
          precoUnitario,
          subtotal: item.quantidade * precoUnitario,
        });
      }

      const subtotalItens = itensComPreco.reduce((acc, item) => acc + item.subtotal, 0);
      const totalPedido = subtotalItens + taxaEntregaPedido;

      return tx.pedido.create({
        data: {
          lojaId: lojaId(req),
          clienteId: clienteIdNumerico || null,
          observacoes,
          dataEntrega: novaDataEntrega,
          horarioEntrega,
          tipoEntrega,
          endereco,
          entregador: null,
          formaPagamento: null,
          taxaEntrega: taxaEntregaPedido,
          total: totalPedido,
          status: novaDataEntrega ? "agendado" : "reservado",
          itens: {
            create: itensComPreco.map((item) => ({
              variacaoProdutoId: item.variacaoProdutoId,
              nomeManual: item.nomeManual || null,
              numeracaoManual: item.numeracaoManual || null,
              quantidade: item.quantidade,
              precoUnitario: item.precoUnitario,
              custoUnitario: item.custoUnitario ?? null,
              outrosCustos: item.outrosCustos ?? null,
              subtotal: item.subtotal,
            })),
          },
        },
        include: includePedidoCompleto(),
      });
    });

    res.status(201).json({ message: "Pedido criado com sucesso!", pedido });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    res.status(400).json({ error: error.message || "Erro interno ao criar pedido." });
  }
});

router.put("/:id/status", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || status === "confirmado") {
      return res.status(400).json({ error: "Para confirmar um pedido, use a acao de confirmar venda." });
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const pedidoAtual = await tx.pedido.findFirst({
        where: { id: Number(req.params.id), lojaId: lojaId(req) },
        include: { itens: true },
      });
      if (!pedidoAtual) throw new Error("Pedido nao encontrado.");
      if (STATUS_FINAIS.includes(pedidoAtual.status)) throw new Error("Pedido ja foi finalizado.");

      if (status === "cancelado" && STATUS_COM_ESTOQUE_RESERVADO.includes(pedidoAtual.status)) {
        for (const item of pedidoAtual.itens) {
          if (!item.variacaoProdutoId) continue;

          await tx.variacaoProduto.update({
            where: { id: item.variacaoProdutoId },
            data: { estoque: { increment: item.quantidade } },
          });
        }
      }

      return tx.pedido.update({
        where: { id: pedidoAtual.id },
        data: { status },
        include: includePedidoCompleto(),
      });
    });

    res.json({ message: `Status atualizado para ${status}.`, pedido });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    res.status(400).json({ error: error.message || "Erro ao atualizar status do pedido." });
  }
});

router.get("/", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: {
        lojaId: lojaId(req),
        status: { notIn: STATUS_FINAIS },
      },
      orderBy: { dataCriacao: "desc" },
      include: includePedidoCompleto(),
    });
    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    res.status(500).json({ error: "Erro ao listar pedidos." });
  }
});

router.get("/hoje", async (req, res) => {
  try {
    const agora = new Date();
    const inicio = new Date(agora);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(agora);
    fim.setHours(23, 59, 59, 999);

    const pedidosHoje = await prisma.pedido.findMany({
      where: {
        lojaId: lojaId(req),
        dataEntrega: { gte: inicio, lte: fim },
        status: { notIn: STATUS_FINAIS },
      },
      include: includePedidoCompleto(),
      orderBy: { horarioEntrega: "asc" },
    });

    res.json(pedidosHoje);
  } catch (error) {
    console.error("Erro ao buscar pedidos de hoje:", error);
    res.status(500).json({ error: "Erro ao buscar pedidos do dia." });
  }
});

router.post("/:id/confirmar", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const formaPagamento = String(req.body.formaPagamento || "").trim();
    const desconto = Math.max(numero(req.body.desconto), 0);
    const entregador = String(req.body.entregador || "").trim() || null;

    if (!formaPagamento) {
      return res.status(400).json({ error: "Informe a forma de pagamento." });
    }

    const venda = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: Number(req.params.id), lojaId: lojaId(req) },
        include: {
          itens: {
            include: {
              variacaoProduto: {
                include: { produto: true },
              },
            },
          },
        },
      });
      if (!pedido) throw new Error("Pedido nao encontrado.");
      if (!STATUS_COM_ESTOQUE_RESERVADO.includes(pedido.status)) {
        throw new Error("Pedido nao esta com estoque reservado para confirmacao.");
      }

      const subtotalProdutos = pedido.itens.reduce(
        (acc, item) => acc + numero(item.precoUnitario) * numero(item.quantidade),
        0
      );
      const descontoAplicado = Math.min(desconto, subtotalProdutos);
      const taxaEntregaFinal = pedido.tipoEntrega === "entrega" ? Math.max(numero(pedido.taxaEntrega), 0) : 0;
      const totalFinal = Math.max(subtotalProdutos + taxaEntregaFinal - descontoAplicado, 0);

      const novaVenda = await tx.venda.create({
        data: {
          lojaId: lojaId(req),
          clienteId: pedido.clienteId || null,
          tipoEntrega: pedido.tipoEntrega,
          taxaEntrega: taxaEntregaFinal,
          entregador: pedido.tipoEntrega === "entrega" ? entregador : null,
          formaPagamento,
          subtotalProdutos,
          desconto: descontoAplicado,
          endereco: pedido.endereco,
          total: totalFinal,
          itens: {
            create: pedido.itens.map((item) => {
              if (!item.variacaoProdutoId) {
                return {
                  variacaoProdutoId: null,
                  nomeManual: item.nomeManual,
                  numeracaoManual: item.numeracaoManual,
                  quantidade: item.quantidade,
                  precoUnitario: item.precoUnitario,
                  custoUnitario: item.custoUnitario,
                  outrosCustos: item.outrosCustos,
                };
              }

              return {
                variacaoProdutoId: item.variacaoProdutoId,
                quantidade: item.quantidade,
                precoUnitario: item.precoUnitario,
                custoUnitario: item.variacaoProduto?.produto?.custoUnitario,
                outrosCustos: item.variacaoProduto?.produto?.outrosCustos,
              };
            }),
          },
        },
        include: includeVendaCompleta(),
      });

      await registrarVendaNoCaixa(tx, {
        lojaId: lojaId(req),
        usuarioId: req.usuario?.id,
        vendaId: novaVenda.id,
        total: novaVenda.total,
        formaPagamento,
      });

      await tx.itemPedido.deleteMany({ where: { pedidoId: pedido.id } });
      await tx.pedido.delete({ where: { id: pedido.id } });
      return novaVenda;
    });

    res.json({ message: "Pedido convertido em venda com sucesso!", venda });
  } catch (error) {
    console.error("Erro ao confirmar pedido:", error);
    res.status(400).json({ error: error.message || "Erro ao confirmar pedido." });
  }
});

module.exports = router;
