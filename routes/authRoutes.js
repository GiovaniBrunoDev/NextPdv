const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const {
  authRequired,
  signToken,
  assinaturaOperacionalAtiva,
} = require("../middlewares/auth");
const { slugify } = require("../utils/slug");

const router = express.Router();
const prisma = new PrismaClient();

function usuarioPayload(usuario) {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    superadmin: usuario.superadmin,
  };
}

function membroPayload(membro) {
  return {
    id: membro.id,
    papel: membro.papel,
    loja: {
      id: membro.loja.id,
      nome: membro.loja.nome,
      slug: membro.loja.slug,
      ativa: membro.loja.ativa,
      assinatura: membro.loja.assinatura,
      assinaturaAtiva: assinaturaOperacionalAtiva(membro.loja.assinatura),
    },
  };
}

async function carregarUsuarioCompleto(id) {
  return prisma.usuario.findUnique({
    where: { id },
    include: {
      membros: {
        where: { ativo: true },
        include: {
          loja: {
            include: {
              assinatura: { include: { plano: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      },
    },
  });
}

router.post("/bootstrap-superadmin", async (req, res) => {
  try {
    const existentes = await prisma.usuario.count({ where: { superadmin: true } });
    if (existentes > 0) {
      return res.status(409).json({ error: "Superadmin ja existe." });
    }

    const { nome = "Super Admin", email, senha } = req.body;
    if (!email || !senha || senha.length < 6) {
      return res.status(400).json({ error: "Informe email e senha com ao menos 6 caracteres." });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const usuario = await prisma.usuario.create({
      data: {
        nome,
        email: String(email).toLowerCase().trim(),
        senhaHash,
        superadmin: true,
        membros: {
          create: {
            lojaId: 1,
            papel: "admin",
          },
        },
      },
    });

    const completo = await carregarUsuarioCompleto(usuario.id);
    res.status(201).json({
      token: signToken(completo),
      usuario: usuarioPayload(completo),
      lojas: completo.membros.map(membroPayload),
    });
  } catch (error) {
    console.error("Erro ao criar superadmin:", error);
    res.status(500).json({ error: "Erro ao criar superadmin." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, senha } = req.body;
    const usuario = await prisma.usuario.findUnique({
      where: { email: String(email || "").toLowerCase().trim() },
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: "Email ou senha invalidos." });
    }

    const senhaOk = await bcrypt.compare(String(senha || ""), usuario.senhaHash);
    if (!senhaOk) {
      return res.status(401).json({ error: "Email ou senha invalidos." });
    }

    const completo = await carregarUsuarioCompleto(usuario.id);
    res.json({
      token: signToken(completo),
      usuario: usuarioPayload(completo),
      lojas: completo.membros.map(membroPayload),
    });
  } catch (error) {
    console.error("Erro ao fazer login:", error);
    res.status(500).json({ error: "Erro ao fazer login." });
  }
});

router.get("/me", authRequired, async (req, res) => {
  const completo = await carregarUsuarioCompleto(req.usuario.id);
  res.json({
    usuario: usuarioPayload(completo),
    lojas: completo.membros.map(membroPayload),
  });
});

router.get("/convites/:token", async (req, res) => {
  try {
    const convite = await prisma.conviteLoja.findUnique({
      where: { token: req.params.token },
      include: { plano: true },
    });

    if (!convite || convite.status !== "pendente" || new Date(convite.expiraEm) < new Date()) {
      return res.status(404).json({ error: "Convite invalido ou expirado." });
    }

    res.json({
      email: convite.email,
      nomeLoja: convite.nomeLoja,
      slugLoja: convite.slugLoja,
      papel: convite.papel,
      expiraEm: convite.expiraEm,
      plano: convite.plano,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao carregar convite." });
  }
});

router.post("/aceitar-convite", async (req, res) => {
  try {
    const { token, nome, email, senha } = req.body;
    if (!token || !nome || !email || !senha || senha.length < 6) {
      return res.status(400).json({ error: "Preencha nome, email e senha com ao menos 6 caracteres." });
    }

    const emailNormalizado = String(email).toLowerCase().trim();
    const convite = await prisma.conviteLoja.findUnique({ where: { token } });
    if (!convite || convite.status !== "pendente" || new Date(convite.expiraEm) < new Date()) {
      return res.status(404).json({ error: "Convite invalido ou expirado." });
    }

    if (convite.email && convite.email.toLowerCase() !== emailNormalizado) {
      return res.status(400).json({ error: "Este convite foi emitido para outro email." });
    }

    const trialDias = Number(process.env.TRIAL_DIAS || 14);
    const venceEm = new Date();
    venceEm.setDate(venceEm.getDate() + trialDias);

    const usuario = await prisma.$transaction(async (tx) => {
      const senhaHash = await bcrypt.hash(senha, 10);
      const slugBase = convite.slugLoja || slugify(convite.nomeLoja);
      const lojaSlug = slugBase || `loja-${crypto.randomUUID().slice(0, 8)}`;

      const loja = await tx.loja.create({
        data: {
          nome: convite.nomeLoja,
          slug: lojaSlug,
          assinatura: {
            create: {
              planoId: convite.planoId || undefined,
              status: "trial",
              fimTrial: venceEm,
              venceEm,
            },
          },
        },
      });

      const novoUsuario = await tx.usuario.create({
        data: {
          nome,
          email: emailNormalizado,
          senhaHash,
          membros: {
            create: {
              lojaId: loja.id,
              papel: convite.papel || "admin",
            },
          },
        },
      });

      await tx.conviteLoja.update({
        where: { id: convite.id },
        data: {
          status: "aceito",
          lojaId: loja.id,
        },
      });

      return novoUsuario;
    });

    const completo = await carregarUsuarioCompleto(usuario.id);
    res.status(201).json({
      token: signToken(completo),
      usuario: usuarioPayload(completo),
      lojas: completo.membros.map(membroPayload),
    });
  } catch (error) {
    console.error("Erro ao aceitar convite:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Email ou slug de loja ja cadastrado." });
    }
    res.status(500).json({ error: "Erro ao aceitar convite." });
  }
});

module.exports = router;
