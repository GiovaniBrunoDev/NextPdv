const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { PrismaClient } = require("@prisma/client");
const {
  authRequired,
  lojaRequired,
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
    telefone: usuario.telefone,
    superadmin: usuario.superadmin,
  };
}

function lojaPayload(loja) {
  return {
    id: loja.id,
    nome: loja.nome,
    slug: loja.slug,
    email: loja.email,
    telefone: loja.telefone,
    documento: loja.documento,
    endereco: loja.endereco,
    bairro: loja.bairro,
    cidade: loja.cidade,
    estado: loja.estado,
    cep: loja.cep,
    ativa: loja.ativa,
    assinatura: loja.assinatura,
    assinaturaAtiva: assinaturaOperacionalAtiva(loja.assinatura),
  };
}

function membroPayload(membro) {
  return {
    id: membro.id,
    papel: membro.papel,
    loja: lojaPayload(membro.loja),
  };
}

function textoLimpo(value) {
  const valor = String(value || "").trim();
  return valor || null;
}

function emailLimpo(value) {
  return String(value || "").toLowerCase().trim();
}

async function gerarSlugUnico(tx, nomeLoja) {
  const base = slugify(nomeLoja) || `loja-${crypto.randomUUID().slice(0, 8)}`;
  let slug = base;
  let contador = 2;

  while (await tx.loja.findUnique({ where: { slug } })) {
    slug = `${base}-${contador}`;
    contador += 1;
  }

  return slug;
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

router.post("/cadastro", async (req, res) => {
  try {
    const {
      nome,
      email,
      telefone,
      senha,
      lojaNome,
      lojaEmail,
      lojaTelefone,
      documento,
      endereco,
      bairro,
      cidade,
      estado,
      cep,
    } = req.body;

    const emailNormalizado = emailLimpo(email);
    const nomeUsuario = textoLimpo(nome);
    const nomeLoja = textoLimpo(lojaNome);

    if (!nomeUsuario || !emailNormalizado || !senha || String(senha).length < 6 || !nomeLoja) {
      return res.status(400).json({
        error: "Preencha nome, email, senha com ao menos 6 caracteres e nome da loja.",
      });
    }

    const trialDias = Number(process.env.TRIAL_DIAS || 14);
    const venceEm = new Date();
    venceEm.setDate(venceEm.getDate() + trialDias);

    const usuario = await prisma.$transaction(async (tx) => {
      const senhaHash = await bcrypt.hash(String(senha), 10);
      const slug = await gerarSlugUnico(tx, nomeLoja);

      const loja = await tx.loja.create({
        data: {
          nome: nomeLoja,
          slug,
          email: textoLimpo(lojaEmail) || emailNormalizado,
          telefone: textoLimpo(lojaTelefone) || textoLimpo(telefone),
          documento: textoLimpo(documento),
          endereco: textoLimpo(endereco),
          bairro: textoLimpo(bairro),
          cidade: textoLimpo(cidade),
          estado: textoLimpo(estado),
          cep: textoLimpo(cep),
          assinatura: {
            create: {
              status: "trial",
              fimTrial: venceEm,
              venceEm,
            },
          },
        },
      });

      return tx.usuario.create({
        data: {
          nome: nomeUsuario,
          email: emailNormalizado,
          telefone: textoLimpo(telefone),
          senhaHash,
          membros: {
            create: {
              lojaId: loja.id,
              papel: "admin",
            },
          },
        },
      });
    });

    const completo = await carregarUsuarioCompleto(usuario.id);
    res.status(201).json({
      token: signToken(completo),
      usuario: usuarioPayload(completo),
      lojas: completo.membros.map(membroPayload),
    });
  } catch (error) {
    console.error("Erro ao cadastrar lojista:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Email ja cadastrado." });
    }
    res.status(500).json({ error: "Erro ao criar cadastro." });
  }
});

router.get("/me", authRequired, async (req, res) => {
  const completo = await carregarUsuarioCompleto(req.usuario.id);
  res.json({
    usuario: usuarioPayload(completo),
    lojas: completo.membros.map(membroPayload),
  });
});

router.put("/minha-conta", authRequired, lojaRequired, async (req, res) => {
  try {
    const { usuario = {}, loja = {}, senhaAtual, novaSenha } = req.body;
    const usuarioData = {};
    const lojaData = {};

    if (usuario.nome !== undefined) {
      const nome = textoLimpo(usuario.nome);
      if (!nome) return res.status(400).json({ error: "Nome do usuario e obrigatorio." });
      usuarioData.nome = nome;
    }

    if (usuario.email !== undefined) {
      const email = emailLimpo(usuario.email);
      if (!email) return res.status(400).json({ error: "Email do usuario e obrigatorio." });
      usuarioData.email = email;
    }

    if (usuario.telefone !== undefined) {
      usuarioData.telefone = textoLimpo(usuario.telefone);
    }

    if (novaSenha) {
      if (String(novaSenha).length < 6) {
        return res.status(400).json({ error: "A nova senha precisa ter ao menos 6 caracteres." });
      }

      const usuarioComSenha = await prisma.usuario.findUnique({
        where: { id: req.usuario.id },
        select: { senhaHash: true },
      });
      const senhaOk = await bcrypt.compare(String(senhaAtual || ""), usuarioComSenha.senhaHash);
      if (!senhaOk) return res.status(400).json({ error: "Senha atual incorreta." });
      usuarioData.senhaHash = await bcrypt.hash(String(novaSenha), 10);
    }

    const podeEditarLoja = req.usuario.superadmin || req.membroLoja?.papel === "admin";
    if (loja && Object.keys(loja).length > 0) {
      if (!podeEditarLoja) {
        return res.status(403).json({ error: "Somente admin pode alterar dados da loja." });
      }

      if (loja.nome !== undefined) {
        const nome = textoLimpo(loja.nome);
        if (!nome) return res.status(400).json({ error: "Nome da loja e obrigatorio." });
        lojaData.nome = nome;
      }

      ["email", "telefone", "documento", "endereco", "bairro", "cidade", "estado", "cep"].forEach((campo) => {
        if (loja[campo] !== undefined) lojaData[campo] = textoLimpo(loja[campo]);
      });
    }

    await prisma.$transaction(async (tx) => {
      if (Object.keys(usuarioData).length > 0) {
        await tx.usuario.update({ where: { id: req.usuario.id }, data: usuarioData });
      }
      if (Object.keys(lojaData).length > 0) {
        await tx.loja.update({ where: { id: req.loja.id }, data: lojaData });
      }
    });

    const completo = await carregarUsuarioCompleto(req.usuario.id);
    res.json({
      token: signToken(completo),
      usuario: usuarioPayload(completo),
      lojas: completo.membros.map(membroPayload),
    });
  } catch (error) {
    console.error("Erro ao atualizar conta:", error);
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Email ja esta em uso." });
    }
    res.status(500).json({ error: "Erro ao atualizar conta." });
  }
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
