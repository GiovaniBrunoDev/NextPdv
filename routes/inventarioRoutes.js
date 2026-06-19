const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");
const { garantirCodigosVariacoes } = require("../services/codigoBarrasService");
const { registrarMovimentosEstoque } = require("../services/estoqueMovimentoService");
const { mensagemPublica } = require("../services/errorResponse");

const router = express.Router();
const prisma = new PrismaClient();
const transacaoOpcoes = { maxWait: 20000, timeout: 120000 };

function lojaId(req) {
  return req.loja.id;
}

function resumoInventario(inventario, manterItens = true) {
  const itens = inventario.itens || [];
  const conferidos = itens.filter((item) => item.quantidadeContada !== null);
  const divergencias = conferidos.filter((item) => item.quantidadeContada !== item.estoqueSistema);
  const { itens: _itens, ...dados } = inventario;

  return {
    ...dados,
    ...(manterItens ? { itens } : {}),
    resumo: {
      total: itens.length,
      conferidos: conferidos.length,
      pendentes: itens.length - conferidos.length,
      divergencias: divergencias.length,
    },
  };
}

async function buscarInventario(id, loja) {
  const inventario = await prisma.inventarioEstoque.findFirst({
    where: { id: Number(id), lojaId: loja },
    include: {
      criadoPor: { select: { id: true, nome: true } },
      itens: {
        orderBy: [{ produtoNome: "asc" }, { numeracao: "asc" }],
      },
    },
  });

  return inventario ? resumoInventario(inventario) : null;
}

router.get("/", requireRole("admin", "gerente"), async (req, res) => {
  try {
    const inventarios = await prisma.inventarioEstoque.findMany({
      where: { lojaId: lojaId(req) },
      orderBy: { iniciadoEm: "desc" },
      include: {
        criadoPor: { select: { id: true, nome: true } },
        itens: {
          select: {
            estoqueSistema: true,
            quantidadeContada: true,
          },
        },
      },
    });

    res.json(inventarios.map((inventario) => resumoInventario(inventario, false)));
  } catch (error) {
    console.error("Erro ao listar inventarios:", error);
    res.status(500).json({ error: "Nao foi possivel carregar os inventarios." });
  }
});

router.get("/:id", requireRole("admin", "gerente"), async (req, res) => {
  try {
    const inventario = await buscarInventario(req.params.id, lojaId(req));
    if (!inventario) return res.status(404).json({ error: "Inventario nao encontrado." });
    res.json(inventario);
  } catch (error) {
    res.status(500).json({ error: "Nao foi possivel carregar o inventario." });
  }
});

router.post("/", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const lojaAtualId = lojaId(req);
    const existente = await prisma.inventarioEstoque.findFirst({
      where: { lojaId: lojaAtualId, status: "em_andamento" },
      select: { id: true },
    });

    if (existente) {
      return res.status(409).json({
        error: "Ja existe um inventario em andamento.",
        inventarioId: existente.id,
      });
    }

    const nome = String(req.body.nome || "").trim() || `Inventario ${new Date().toLocaleDateString("pt-BR")}`;

    const inventarioId = await prisma.$transaction(async (tx) => {
      const variacoes = await tx.variacaoProduto.findMany({
        where: { produto: { lojaId: lojaAtualId } },
        include: { produto: { select: { nome: true } } },
        orderBy: { id: "asc" },
      });

      if (!variacoes.length) throw new Error("Cadastre produtos antes de iniciar o inventario.");

      const variacoesComCodigo = await garantirCodigosVariacoes(tx, lojaAtualId, variacoes);
      const produtoPorVariacao = new Map(variacoes.map((variacao) => [variacao.id, variacao.produto.nome]));

      const inventario = await tx.inventarioEstoque.create({
        data: {
          lojaId: lojaAtualId,
          criadoPorId: req.usuario?.id || null,
          nome,
        },
      });

      await tx.inventarioItem.createMany({
        data: variacoesComCodigo.map((variacao) => ({
          inventarioId: inventario.id,
          variacaoProdutoId: variacao.id,
          produtoNome: produtoPorVariacao.get(variacao.id),
          numeracao: variacao.numeracao,
          codigoBarras: variacao.codigoBarras,
          estoqueSistema: variacao.estoque,
        })),
      });

      return inventario.id;
    }, transacaoOpcoes);

    res.status(201).json(await buscarInventario(inventarioId, lojaAtualId));
  } catch (error) {
    console.error("Erro ao iniciar inventario:", error);
    res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel iniciar o inventario.") });
  }
});

router.patch("/:id/contagem", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  const quantidade = Number(req.body.quantidade);
  const incrementar = Boolean(req.body.incrementar);
  const codigoBarras = String(req.body.codigoBarras || "").trim();
  const variacaoProdutoId = Number(req.body.variacaoProdutoId || 0);

  if (!Number.isInteger(quantidade) || quantidade < 0) {
    return res.status(400).json({ error: "Informe uma quantidade valida." });
  }
  if (!codigoBarras && !variacaoProdutoId) {
    return res.status(400).json({ error: "Informe o codigo de barras ou a variacao." });
  }

  try {
    const inventario = await prisma.inventarioEstoque.findFirst({
      where: { id: Number(req.params.id), lojaId: lojaId(req), status: "em_andamento" },
      select: { id: true },
    });
    if (!inventario) return res.status(404).json({ error: "Inventario em andamento nao encontrado." });

    const item = await prisma.inventarioItem.findFirst({
      where: {
        inventarioId: inventario.id,
        ...(codigoBarras ? { codigoBarras } : { variacaoProdutoId }),
      },
    });
    if (!item) return res.status(404).json({ error: "Item nao pertence a este inventario." });

    const quantidadeContada = incrementar ? Number(item.quantidadeContada || 0) + quantidade : quantidade;
    const atualizado = await prisma.inventarioItem.update({
      where: { id: item.id },
      data: {
        quantidadeContada,
        conferidoEm: new Date(),
      },
    });

    res.json(atualizado);
  } catch (error) {
    res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel registrar a contagem.") });
  }
});

router.post("/:id/finalizar", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const lojaAtualId = lojaId(req);
    const zerarNaoContados = Boolean(req.body.zerarNaoContados);

    await prisma.$transaction(async (tx) => {
      const inventario = await tx.inventarioEstoque.findFirst({
        where: { id: Number(req.params.id), lojaId: lojaAtualId, status: "em_andamento" },
        include: {
          itens: {
            include: {
              variacaoProduto: {
                include: { produto: { select: { lojaId: true } } },
              },
            },
          },
        },
      });

      if (!inventario) throw new Error("Inventario em andamento nao encontrado.");

      const itensParaAjustar = inventario.itens.filter(
        (item) => item.variacaoProduto && (item.quantidadeContada !== null || zerarNaoContados)
      );
      if (!itensParaAjustar.length) throw new Error("Conte ao menos um item antes de finalizar.");

      const movimentos = [];
      for (const item of itensParaAjustar) {
        if (item.variacaoProduto.produto.lojaId !== lojaAtualId) {
          throw new Error("Foi encontrado um item de outra loja no inventario.");
        }

        const quantidadeFinal = item.quantidadeContada === null ? 0 : item.quantidadeContada;
        const saldoAnterior = item.variacaoProduto.estoque;

        if (item.quantidadeContada === null) {
          await tx.inventarioItem.update({
            where: { id: item.id },
            data: { quantidadeContada: 0, conferidoEm: new Date() },
          });
        }

        if (saldoAnterior === quantidadeFinal) continue;

        await tx.variacaoProduto.update({
          where: { id: item.variacaoProduto.id },
          data: { estoque: quantidadeFinal },
        });
        movimentos.push({
          lojaId: lojaAtualId,
          variacaoProdutoId: item.variacaoProduto.id,
          usuarioId: req.usuario?.id,
          tipo: "ajuste_inventario",
          quantidade: quantidadeFinal - saldoAnterior,
          saldoAnterior,
          saldoFinal: quantidadeFinal,
          origemTipo: "inventario",
          origemId: inventario.id,
          observacao: inventario.nome,
        });
      }

      await registrarMovimentosEstoque(tx, movimentos);
      await tx.inventarioEstoque.update({
        where: { id: inventario.id },
        data: { status: "finalizado", finalizadoEm: new Date() },
      });
    }, transacaoOpcoes);

    res.json(await buscarInventario(req.params.id, lojaAtualId));
  } catch (error) {
    console.error("Erro ao finalizar inventario:", error);
    res.status(400).json({ error: mensagemPublica(error, "Nao foi possivel finalizar o inventario.") });
  }
});

router.post("/:id/cancelar", assinaturaAtivaRequired, requireRole("admin", "gerente"), async (req, res) => {
  try {
    const inventario = await prisma.inventarioEstoque.updateMany({
      where: { id: Number(req.params.id), lojaId: lojaId(req), status: "em_andamento" },
      data: { status: "cancelado", finalizadoEm: new Date() },
    });
    if (!inventario.count) return res.status(404).json({ error: "Inventario em andamento nao encontrado." });
    res.json(await buscarInventario(req.params.id, lojaId(req)));
  } catch (error) {
    res.status(400).json({ error: "Nao foi possivel cancelar o inventario." });
  }
});

module.exports = router;
