const express = require("express");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const { authRequired, requireSuperadmin, assinaturaOperacionalAtiva } = require("../middlewares/auth");
const { slugify } = require("../utils/slug");

const router = express.Router();
const prisma = new PrismaClient();

router.use(authRequired, requireSuperadmin);

const PERFIS_VALIDOS = ["admin", "gerente", "vendedor"];

function textoLimpo(value) {
  return String(value || "").trim();
}

function emailLimpo(value) {
  return textoLimpo(value).toLowerCase();
}

function conviteComLink(convite) {
  return {
    ...convite,
    link: `${process.env.FRONTEND_URL || "http://localhost:3000"}/convite/${convite.token}`,
  };
}

function temHistoricoOperacional(count = {}) {
  return Boolean(
    count.caixasAbertos ||
      count.caixasFechados ||
      count.movimentosCaixaCriados ||
      count.movimentosEstoqueCriados ||
      count.inventariosCriados
  );
}

async function usuarioAdminPayload(usuario) {
  const historicoOperacional = temHistoricoOperacional(usuario._count);
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    telefone: usuario.telefone,
    superadmin: usuario.superadmin,
    ativo: usuario.ativo,
    criadoEm: usuario.criadoEm,
    atualizadoEm: usuario.atualizadoEm,
    historicoOperacional,
    podeExcluirDefinitivo: !historicoOperacional,
    lojas: usuario.membros.map((membro) => ({
      id: membro.id,
      lojaId: membro.lojaId,
      lojaNome: membro.loja?.nome,
      lojaSlug: membro.loja?.slug,
      papel: membro.papel,
      ativo: membro.ativo,
    })),
    totais: {
      lojas: usuario._count?.membros || 0,
      convitesCriados: usuario._count?.convites || 0,
    },
  };
}

router.get("/lojas", async (req, res) => {
  const lojas = await prisma.loja.findMany({
    orderBy: { criadaEm: "desc" },
    include: {
      assinatura: { include: { plano: true } },
      membros: {
        orderBy: { id: "asc" },
        include: {
          usuario: {
            select: {
              id: true,
              nome: true,
              email: true,
              telefone: true,
              ativo: true,
              superadmin: true,
            },
          },
        },
      },
      _count: {
        select: {
          produtos: true,
          clientes: true,
          vendas: true,
          pedidos: true,
        },
      },
    },
  });

  res.json(
    lojas.map((loja) => ({
      ...loja,
      assinaturaAtiva: assinaturaOperacionalAtiva(loja.assinatura),
    }))
  );
});

router.put("/lojas/:id", async (req, res) => {
  const { nome, ativa, email, telefone, documento } = req.body;
  const loja = await prisma.loja.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(nome !== undefined ? { nome } : {}),
      ...(ativa !== undefined ? { ativa: Boolean(ativa) } : {}),
      ...(email !== undefined ? { email: textoLimpo(email) || null } : {}),
      ...(telefone !== undefined ? { telefone: textoLimpo(telefone) || null } : {}),
      ...(documento !== undefined ? { documento: textoLimpo(documento) || null } : {}),
    },
    include: { assinatura: { include: { plano: true } } },
  });
  res.json(loja);
});

router.get("/usuarios", async (req, res) => {
  const usuarios = await prisma.usuario.findMany({
    orderBy: { criadoEm: "desc" },
    include: {
      membros: {
        orderBy: { id: "asc" },
        include: {
          loja: { select: { id: true, nome: true, slug: true } },
        },
      },
      _count: {
        select: {
          membros: true,
          convites: true,
          caixasAbertos: true,
          caixasFechados: true,
          movimentosCaixaCriados: true,
          movimentosEstoqueCriados: true,
          inventariosCriados: true,
        },
      },
    },
  });

  res.json(await Promise.all(usuarios.map(usuarioAdminPayload)));
});

router.put("/usuarios/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { nome, email, telefone, ativo, superadmin } = req.body;

  if (id === req.usuario.id && ativo === false) {
    return res.status(400).json({ error: "Voce nao pode desativar seu proprio usuario." });
  }

  const data = {};
  if (nome !== undefined) {
    const nomeLimpo = textoLimpo(nome);
    if (!nomeLimpo) return res.status(400).json({ error: "Nome do usuario obrigatorio." });
    data.nome = nomeLimpo;
  }
  if (email !== undefined) {
    const emailNormalizado = emailLimpo(email);
    if (!emailNormalizado) return res.status(400).json({ error: "Email do usuario obrigatorio." });
    data.email = emailNormalizado;
  }
  if (telefone !== undefined) data.telefone = textoLimpo(telefone) || null;
  if (ativo !== undefined) data.ativo = Boolean(ativo);
  if (superadmin !== undefined) data.superadmin = Boolean(superadmin);

  try {
    const atualizado = await prisma.usuario.update({
      where: { id },
      data,
      include: {
        membros: { include: { loja: { select: { id: true, nome: true, slug: true } } } },
        _count: {
          select: {
            membros: true,
            convites: true,
            caixasAbertos: true,
            caixasFechados: true,
            movimentosCaixaCriados: true,
            movimentosEstoqueCriados: true,
            inventariosCriados: true,
          },
        },
      },
    });

    res.json(await usuarioAdminPayload(atualizado));
  } catch (error) {
    if (error.code === "P2002") return res.status(409).json({ error: "Email ja esta em uso." });
    res.status(400).json({ error: "Erro ao atualizar usuario.", detalhes: error.message });
  }
});

router.delete("/usuarios/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) {
    return res.status(400).json({ error: "Voce nao pode excluir seu proprio usuario logado." });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          caixasAbertos: true,
          caixasFechados: true,
          movimentosCaixaCriados: true,
          movimentosEstoqueCriados: true,
          inventariosCriados: true,
        },
      },
    },
  });

  if (!usuario) return res.status(404).json({ error: "Usuario nao encontrado." });

  if (usuario.superadmin) {
    const outrosSuperadmins = await prisma.usuario.count({
      where: { superadmin: true, ativo: true, id: { not: id } },
    });
    if (!outrosSuperadmins) {
      return res.status(400).json({ error: "Mantenha ao menos um superadmin ativo." });
    }
  }

  const manterHistorico = temHistoricoOperacional(usuario._count);
  if (manterHistorico) {
    await prisma.$transaction([
      prisma.membroLoja.updateMany({ where: { usuarioId: id }, data: { ativo: false } }),
      prisma.usuario.update({ where: { id }, data: { ativo: false, superadmin: false } }),
    ]);
    return res.json({
      acao: "desativado",
      mensagem: "Usuario possui historico operacional e foi desativado com seguranca.",
    });
  }

  await prisma.usuario.delete({ where: { id } });
  res.json({ acao: "excluido", mensagem: "Usuario excluido definitivamente." });
});

router.put("/membros/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { papel, ativo } = req.body;
  const data = {};

  if (papel !== undefined) {
    if (!PERFIS_VALIDOS.includes(papel)) {
      return res.status(400).json({ error: "Perfil invalido." });
    }
    data.papel = papel;
  }
  if (ativo !== undefined) data.ativo = Boolean(ativo);

  const membro = await prisma.membroLoja.update({
    where: { id },
    data,
    include: {
      usuario: { select: { id: true, nome: true, email: true, ativo: true } },
      loja: { select: { id: true, nome: true, slug: true } },
    },
  });

  res.json(membro);
});

router.get("/planos", async (req, res) => {
  const planos = await prisma.plano.findMany({ orderBy: { id: "asc" } });
  res.json(planos);
});

router.post("/planos", async (req, res) => {
  const { nome, valorMensal, descricao, ativo = true } = req.body;
  if (!nome) return res.status(400).json({ error: "Nome do plano obrigatorio." });

  const plano = await prisma.plano.create({
    data: {
      nome,
      valorMensal: Number(valorMensal || 0),
      descricao: descricao || null,
      ativo: Boolean(ativo),
    },
  });
  res.status(201).json(plano);
});

router.put("/planos/:id", async (req, res) => {
  const { nome, valorMensal, descricao, ativo } = req.body;
  const plano = await prisma.plano.update({
    where: { id: Number(req.params.id) },
    data: {
      ...(nome !== undefined ? { nome } : {}),
      ...(valorMensal !== undefined ? { valorMensal: Number(valorMensal || 0) } : {}),
      ...(descricao !== undefined ? { descricao: descricao || null } : {}),
      ...(ativo !== undefined ? { ativo: Boolean(ativo) } : {}),
    },
  });
  res.json(plano);
});

router.post("/convites", async (req, res) => {
  const { email, nomeLoja, planoId, papel = "admin", diasExpiracao = 7 } = req.body;
  if (!nomeLoja) return res.status(400).json({ error: "Nome da loja obrigatorio." });

  const token = crypto.randomBytes(24).toString("hex");
  const expiraEm = new Date();
  expiraEm.setDate(expiraEm.getDate() + Number(diasExpiracao || 7));

  const convite = await prisma.conviteLoja.create({
    data: {
      token,
      email: email ? String(email).toLowerCase().trim() : null,
      nomeLoja,
      slugLoja: slugify(nomeLoja),
      planoId: planoId ? Number(planoId) : null,
      papel,
      criadoPorId: req.usuario.id,
      expiraEm,
    },
    include: { plano: true },
  });

  res.status(201).json(conviteComLink(convite));
});

router.get("/convites", async (req, res) => {
  const convites = await prisma.conviteLoja.findMany({
    orderBy: { criadoEm: "desc" },
    include: { plano: true, loja: true },
  });
  res.json(convites.map(conviteComLink));
});

router.put("/assinaturas/:lojaId", async (req, res) => {
  const { status, planoId, venceEm } = req.body;
  const assinatura = await prisma.assinatura.upsert({
    where: { lojaId: Number(req.params.lojaId) },
    create: {
      lojaId: Number(req.params.lojaId),
      planoId: planoId ? Number(planoId) : null,
      status: status || "ativa",
      fimTrial: venceEm ? new Date(venceEm) : new Date(),
      venceEm: venceEm ? new Date(venceEm) : new Date(),
    },
    update: {
      ...(status !== undefined ? { status } : {}),
      ...(planoId !== undefined ? { planoId: planoId ? Number(planoId) : null } : {}),
      ...(venceEm !== undefined ? { venceEm: new Date(venceEm) } : {}),
    },
    include: { plano: true },
  });

  res.json(assinatura);
});

module.exports = router;
