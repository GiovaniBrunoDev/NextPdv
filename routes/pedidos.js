const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const { registrarVendaNoCaixa } = require("../services/caixaService");
const { registrarFinanceiroVenda } = require("../services/financeiroService");
const { registrarMovimentoEstoque } = require("../services/estoqueMovimentoService");
const { mensagemPublica } = require("../services/errorResponse");
const {
  notificarNovoPedido,
  notificarVendaPedidoConfirmada,
} = require("../services/notificacaoPushService");

const router = express.Router();
const prisma = new PrismaClient();
const transacaoOperacionalOpcoes = { maxWait: 10000, timeout: 20000 };

const STATUS_COM_ESTOQUE_RESERVADO = ["reservado", "agendado", "confirmado"];
const STATUS_FINAIS = ["cancelado", "entregue"];

function lojaId(req) {
  return req.loja.id;
}

function escopoPedido(req) {
  if (!req.membroLoja?.vendasPropriasApenas) return {};
  return { criadoPorId: req.usuario.id };
}

function produtoSemDadosFinanceiros(produto) {
  if (!produto) return produto;
  const { custoUnitario, outrosCustos, fornecedorId, ...produtoOperacional } = produto;
  return produtoOperacional;
}

function itensVisiveisParaMembro(req, itens = []) {
  if (!req.membroLoja?.vendasPropriasApenas) return itens;

  return itens.map((item) => {
    const { custoUnitario, outrosCustos, ...itemOperacional } = item;
    if (!item.variacaoProduto) return itemOperacional;

    return {
      ...itemOperacional,
      variacaoProduto: {
        ...item.variacaoProduto,
        produto: produtoSemDadosFinanceiros(item.variacaoProduto.produto),
      },
    };
  });
}

function pedidoVisivelParaMembro(req, pedido) {
  if (!pedido || !req.membroLoja?.vendasPropriasApenas) return pedido;
  return { ...pedido, itens: itensVisiveisParaMembro(req, pedido.itens) };
}

function vendaVisivelParaMembro(req, venda) {
  if (!venda || !req.membroLoja?.vendasPropriasApenas) return venda;
  return {
    ...venda,
    itens: itensVisiveisParaMembro(req, venda.itens),
    pagamentos: (venda.pagamentos || []).map((pagamento) => {
      const { conta, lancamentos, ...pagamentoOperacional } = pagamento;
      return pagamentoOperacional;
    }),
  };
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const numero = Number(typeof value === "string" ? value.replace(",", ".") : value);
  return Number.isFinite(numero) ? numero : null;
}

function numero(value, fallback = 0) {
  return toNumberOrNull(value) ?? fallback;
}

function dataCalendario(value) {
  if (value === null || value === undefined || value === "") return null;

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (!match) throw new Error("Data de entrega inválida.");

  const ano = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));

  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) {
    throw new Error("Data de entrega inválida.");
  }

  return data;
}

function dataAtualNoBrasil() {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return dataCalendario(`${valores.year}-${valores.month}-${valores.day}`);
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
    const quantidade = Number(item.quantidade ?? item.qtd ?? 1);
    const precoUnitario = toNumberOrNull(item.precoUnitario ?? item.preco ?? item.valorVenda);

    if (itemManual(item)) {
      return {
        manual: true,
        nomeManual: String(item.nomeManual || item.nome || item.descricao || "").trim(),
        numeracaoManual: String(item.numeracaoManual || item.numeracao || item.tamanho || "").trim() || null,
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
    criadoPor: { select: { id: true, nome: true } },
    itens: { include: { variacaoProduto: { include: { produto: true } } } },
  };
}

function includeVendaCompleta() {
  return {
    cliente: true,
    itens: { include: { variacaoProduto: { include: { produto: true } } } },
    pagamentos: { include: { conta: true, lancamentos: true } },
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
    if (itemInvalido) return res.status(400).json({ error: "Itens do pedido inválidos." });

    const novaDataEntrega = dataCalendario(dataEntrega);
    const clienteIdNumerico = toNumberOrNull(clienteId);
    const taxaEntregaPedido = tipoEntrega === "entrega" ? Math.max(numero(taxaEntrega), 0) : 0;

    const pedido = await prisma.$transaction(async (tx) => {
      if (clienteIdNumerico) {
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteIdNumerico, lojaId: lojaId(req) },
        });
        if (!cliente) throw new Error("Cliente não encontrado nesta loja.");
      }

      const itensComPreco = [];
      const movimentosReservaIds = [];
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
        if (!variacao) throw new Error(`Variação ${item.variacaoProdutoId} não encontrada.`);

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

        const movimentoReserva = await registrarMovimentoEstoque(tx, {
          lojaId: lojaId(req),
          variacaoProdutoId: variacao.id,
          usuarioId: req.usuario?.id,
          tipo: "reserva_pedido",
          quantidade: -item.quantidade,
          saldoAnterior: variacao.estoque,
          saldoFinal: variacao.estoque - item.quantidade,
          origemTipo: "pedido",
        });
        movimentosReservaIds.push(movimentoReserva.id);

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

      const pedidoCriado = await tx.pedido.create({
        data: {
          lojaId: lojaId(req),
          criadoPorId: req.usuario?.id || null,
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

      if (movimentosReservaIds.length) {
        await tx.movimentoEstoque.updateMany({
          where: { id: { in: movimentosReservaIds } },
          data: { origemId: pedidoCriado.id },
        });
      }

      return pedidoCriado;
    }, transacaoOperacionalOpcoes);

    notificarNovoPedido(prisma, {
      lojaId: lojaId(req),
      pedido,
      criadoPorId: req.usuario?.id,
      criadoPorNome: req.usuario?.nome,
    }).catch((error) => console.error("Erro ao enviar notificação do pedido:", error.message));

    res.status(201).json({ message: "Pedido criado com sucesso!", pedido: pedidoVisivelParaMembro(req, pedido) });
  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    res.status(400).json({ error: mensagemPublica(error, "Não foi possível criar o pedido. Tente novamente.") });
  }
});

router.put("/:id", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
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
    if (itemInvalido) return res.status(400).json({ error: "Itens do pedido inválidos." });

    const pedidoId = Number(req.params.id);
    const novaDataEntrega = dataCalendario(dataEntrega);
    const clienteIdNumerico = toNumberOrNull(clienteId);
    const tipoEntregaFinal = tipoEntrega || "retirada";
    const taxaEntregaPedido = tipoEntregaFinal === "entrega" ? Math.max(numero(taxaEntrega), 0) : 0;

    const pedido = await prisma.$transaction(async (tx) => {
      const pedidoAtual = await tx.pedido.findFirst({
        where: { id: pedidoId, lojaId: lojaId(req), ...escopoPedido(req) },
        include: { itens: true },
      });

      if (!pedidoAtual) throw new Error("Pedido não encontrado.");
      if (STATUS_FINAIS.includes(pedidoAtual.status)) throw new Error("Pedido já foi finalizado.");

      if (clienteIdNumerico) {
        const cliente = await tx.cliente.findFirst({
          where: { id: clienteIdNumerico, lojaId: lojaId(req) },
        });
        if (!cliente) throw new Error("Cliente não encontrado nesta loja.");
      }

      const reservaAtiva = STATUS_COM_ESTOQUE_RESERVADO.includes(pedidoAtual.status);
      if (reservaAtiva) {
        for (const item of pedidoAtual.itens) {
          if (!item.variacaoProdutoId) continue;

          const variacao = await tx.variacaoProduto.findUnique({
            where: { id: item.variacaoProdutoId },
          });
          if (!variacao) continue;

          const variacaoAtualizada = await tx.variacaoProduto.update({
            where: { id: item.variacaoProdutoId },
            data: { estoque: { increment: item.quantidade } },
          });
          await registrarMovimentoEstoque(tx, {
            lojaId: lojaId(req),
            variacaoProdutoId: item.variacaoProdutoId,
            usuarioId: req.usuario?.id,
            tipo: "edicao_pedido_retorno",
            quantidade: item.quantidade,
            saldoAnterior: variacao.estoque,
            saldoFinal: variacaoAtualizada.estoque,
            origemTipo: "pedido",
            origemId: pedidoAtual.id,
          });
        }
      }

      const itensComPreco = [];
      for (const item of produtos) {
        if (item.manual) {
          itensComPreco.push({
            variacaoProdutoId: null,
            nomeManual: item.nomeManual,
            numeracaoManual: item.numeracaoManual,
            quantidade: item.quantidade,
            precoUnitario: item.precoUnitario,
            custoUnitario: item.custoUnitario,
            outrosCustos: item.outrosCustos,
            subtotal: item.quantidade * item.precoUnitario,
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
        if (!variacao) throw new Error(`Variação ${item.variacaoProdutoId} não encontrada.`);

        if (reservaAtiva) {
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

          await registrarMovimentoEstoque(tx, {
            lojaId: lojaId(req),
            variacaoProdutoId: variacao.id,
            usuarioId: req.usuario?.id,
            tipo: "edicao_pedido_reserva",
            quantidade: -item.quantidade,
            saldoAnterior: variacao.estoque,
            saldoFinal: variacao.estoque - item.quantidade,
            origemTipo: "pedido",
            origemId: pedidoAtual.id,
          });
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
      const statusAtualizado = pedidoAtual.status === "confirmado" ? "confirmado" : novaDataEntrega ? "agendado" : "reservado";

      await tx.itemPedido.deleteMany({ where: { pedidoId: pedidoAtual.id } });

      return tx.pedido.update({
        where: { id: pedidoAtual.id },
        data: {
          clienteId: clienteIdNumerico || null,
          observacoes,
          dataEntrega: novaDataEntrega,
          horarioEntrega,
          tipoEntrega: tipoEntregaFinal,
          endereco: tipoEntregaFinal === "entrega" ? endereco : null,
          taxaEntrega: taxaEntregaPedido,
          total: totalPedido,
          status: statusAtualizado,
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
    }, transacaoOperacionalOpcoes);

    res.json({ message: "Pedido atualizado com sucesso!", pedido: pedidoVisivelParaMembro(req, pedido) });
  } catch (error) {
    console.error("Erro ao editar pedido:", error);
    res.status(400).json({ error: mensagemPublica(error, "Não foi possível atualizar o pedido. Tente novamente.") });
  }
});

router.put("/:id/status", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || status === "confirmado") {
      return res.status(400).json({ error: "Para confirmar um pedido, use a ação de confirmar venda." });
    }

    const pedido = await prisma.$transaction(async (tx) => {
      const pedidoAtual = await tx.pedido.findFirst({
        where: { id: Number(req.params.id), lojaId: lojaId(req), ...escopoPedido(req) },
        include: { itens: true },
      });
      if (!pedidoAtual) throw new Error("Pedido não encontrado.");
      if (STATUS_FINAIS.includes(pedidoAtual.status)) throw new Error("Pedido já foi finalizado.");

      if (status === "cancelado" && STATUS_COM_ESTOQUE_RESERVADO.includes(pedidoAtual.status)) {
        for (const item of pedidoAtual.itens) {
          if (!item.variacaoProdutoId) continue;

          const variacao = await tx.variacaoProduto.findUnique({
            where: { id: item.variacaoProdutoId },
          });
          if (!variacao) continue;

          const variacaoAtualizada = await tx.variacaoProduto.update({
            where: { id: item.variacaoProdutoId },
            data: { estoque: { increment: item.quantidade } },
          });
          await registrarMovimentoEstoque(tx, {
            lojaId: lojaId(req),
            variacaoProdutoId: item.variacaoProdutoId,
            usuarioId: req.usuario?.id,
            tipo: "cancelamento_pedido",
            quantidade: item.quantidade,
            saldoAnterior: variacao.estoque,
            saldoFinal: variacaoAtualizada.estoque,
            origemTipo: "pedido",
            origemId: pedidoAtual.id,
          });
        }
      }

      return tx.pedido.update({
        where: { id: pedidoAtual.id },
        data: { status },
        include: includePedidoCompleto(),
      });
    }, transacaoOperacionalOpcoes);

    res.json({ message: `Status atualizado para ${status}.`, pedido: pedidoVisivelParaMembro(req, pedido) });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    res.status(400).json({ error: mensagemPublica(error, "Não foi possível atualizar o status do pedido.") });
  }
});

router.get("/", async (req, res) => {
  try {
    const pedidos = await prisma.pedido.findMany({
      where: {
        lojaId: lojaId(req),
        ...escopoPedido(req),
        status: { notIn: STATUS_FINAIS },
      },
      orderBy: { dataCriacao: "desc" },
      include: includePedidoCompleto(),
    });
    res.json(pedidos.map((pedido) => pedidoVisivelParaMembro(req, pedido)));
  } catch (error) {
    console.error("Erro ao listar pedidos:", error);
    res.status(500).json({ error: "Erro ao listar pedidos." });
  }
});

router.get("/hoje", async (req, res) => {
  try {
    const inicio = dataAtualNoBrasil();
    const fim = new Date(inicio.getTime() + 24 * 60 * 60 * 1000 - 1);

    const pedidosHoje = await prisma.pedido.findMany({
      where: {
        lojaId: lojaId(req),
        ...escopoPedido(req),
        dataEntrega: { gte: inicio, lte: fim },
        status: { notIn: STATUS_FINAIS },
      },
      include: includePedidoCompleto(),
      orderBy: { horarioEntrega: "asc" },
    });

    res.json(pedidosHoje.map((pedido) => pedidoVisivelParaMembro(req, pedido)));
  } catch (error) {
    console.error("Erro ao buscar pedidos de hoje:", error);
    res.status(500).json({ error: "Erro ao buscar pedidos do dia." });
  }
});

router.post("/:id/confirmar", assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), async (req, res) => {
  try {
    const formaPagamento = String(req.body.formaPagamento || "").trim();
    const pagamentos = Array.isArray(req.body.pagamentos) ? req.body.pagamentos : [];
    const desconto = Math.max(numero(req.body.desconto), 0);
    const entregador = String(req.body.entregador || "").trim() || null;

    if (!formaPagamento && pagamentos.length === 0) {
      return res.status(400).json({ error: "Informe a forma de pagamento." });
    }

    const confirmacao = await prisma.$transaction(async (tx) => {
      const pedido = await tx.pedido.findFirst({
        where: { id: Number(req.params.id), lojaId: lojaId(req), ...escopoPedido(req) },
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
      if (!pedido) throw new Error("Pedido não encontrado.");
      if (!STATUS_COM_ESTOQUE_RESERVADO.includes(pedido.status)) {
        throw new Error("Pedido não está com estoque reservado para confirmação.");
      }

      const subtotalProdutos = pedido.itens.reduce(
        (acc, item) => acc + numero(item.precoUnitario) * numero(item.quantidade),
        0
      );
      const taxaEntregaFinal = pedido.tipoEntrega === "entrega" ? Math.max(numero(pedido.taxaEntrega), 0) : 0;
      const totalAntesDesconto = subtotalProdutos + taxaEntregaFinal;
      const descontoAplicado = Math.min(desconto, totalAntesDesconto);
      const totalFinal = Math.max(totalAntesDesconto - descontoAplicado, 0);

      const novaVenda = await tx.venda.create({
        data: {
          lojaId: lojaId(req),
          criadoPorId: pedido.criadoPorId || req.usuario?.id || null,
          clienteId: pedido.clienteId || null,
          tipoEntrega: pedido.tipoEntrega,
          taxaEntrega: taxaEntregaFinal,
          entregador: pedido.tipoEntrega === "entrega" ? entregador : null,
          formaPagamento: formaPagamento || "Misto",
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
        pagamentos,
      });

      await registrarFinanceiroVenda(tx, {
        lojaId: lojaId(req),
        usuarioId: req.usuario?.id,
        venda: novaVenda,
        pagamentos,
        formaPagamento,
      });

      await tx.itemPedido.deleteMany({ where: { pedidoId: pedido.id } });
      await tx.pedido.delete({ where: { id: pedido.id } });
      return {
        venda: novaVenda,
        pedidoId: pedido.id,
        pedidoCriadoPorId: pedido.criadoPorId,
      };
    }, transacaoOperacionalOpcoes);

    const { venda, pedidoId, pedidoCriadoPorId } = confirmacao;
    notificarVendaPedidoConfirmada(prisma, {
      lojaId: lojaId(req),
      usuarioId: pedidoCriadoPorId,
      pedidoId,
      venda,
    }).catch((error) => console.error("Erro ao enviar notificação da venda confirmada:", error.message));

    res.json({ message: "Pedido convertido em venda com sucesso!", venda: vendaVisivelParaMembro(req, venda) });
  } catch (error) {
    console.error("Erro ao confirmar pedido:", error);
    res.status(400).json({ error: mensagemPublica(error, "Não foi possível confirmar o pedido. Tente novamente.") });
  }
});

module.exports = router;
