const express = require("express");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const prisma = new PrismaClient();
const PERFIS_EQUIPE = ["gerente", "vendedor"];

function textoLimpo(value) {
  return String(value || "").trim();
}

function emailLimpo(value) {
  return textoLimpo(value).toLowerCase();
}

function membroPayload(membro) {
  return {
    id: membro.id,
    papel: membro.papel,
    ativo: membro.ativo,
    criadoEm: membro.criadoEm,
    usuario: {
      id: membro.usuario.id,
      nome: membro.usuario.nome,
      email: membro.usuario.email,
      telefone: membro.usuario.telefone,
      ativo: membro.usuario.ativo,
    },
  };
}

router.use(requireRole("admin"));

router.get("/", async (req, res) => {
  try {
    const membros = await prisma.membroLoja.findMany({
      where: { lojaId: req.loja.id },
      orderBy: [{ ativo: "desc" }, { criadoEm: "asc" }],
      include: {
        usuario: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            ativo: true,
          },
        },
      },
    });

    res.json(membros.map(membroPayload));
  } catch (error) {
    console.error("Erro ao carregar equipe:", error);
    res.status(500).json({ error: "Não foi possível carregar a equipe." });
  }
});

router.post("/", assinaturaAtivaRequired, async (req, res) => {
  const nome = textoLimpo(req.body.nome);
  const email = emailLimpo(req.body.email);
  const telefone = textoLimpo(req.body.telefone) || null;
  const senha = String(req.body.senha || "");
  const papel = textoLimpo(req.body.papel || "vendedor").toLowerCase();

  if (!nome || !email) {
    return res.status(400).json({ error: "Informe o nome e o e-mail da usuária." });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ error: "Informe um e-mail válido." });
  }
  if (senha.length < 6) {
    return res.status(400).json({ error: "A senha inicial deve ter ao menos 6 caracteres." });
  }
  if (!PERFIS_EQUIPE.includes(papel)) {
    return res.status(400).json({ error: "Escolha o perfil vendedor ou gerente." });
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const usuarioExistente = await tx.usuario.findUnique({ where: { email } });

      if (usuarioExistente) {
        if (!usuarioExistente.ativo) {
          const erro = new Error("Este usuário está desativado. Reative-o pelo painel administrativo.");
          erro.statusCode = 409;
          throw erro;
        }

        const vinculo = await tx.membroLoja.findUnique({
          where: {
            usuarioId_lojaId: {
              usuarioId: usuarioExistente.id,
              lojaId: req.loja.id,
            },
          },
        });

        if (vinculo?.ativo) {
          const erro = new Error("Este e-mail já faz parte da equipe desta loja.");
          erro.statusCode = 409;
          throw erro;
        }

        const membro = vinculo
          ? await tx.membroLoja.update({
              where: { id: vinculo.id },
              data: { papel, ativo: true },
              include: { usuario: true },
            })
          : await tx.membroLoja.create({
              data: { lojaId: req.loja.id, usuarioId: usuarioExistente.id, papel },
              include: { usuario: true },
            });

        return { membro, usuarioExistente: true };
      }

      const senhaHash = await bcrypt.hash(senha, 10);
      const usuario = await tx.usuario.create({
        data: { nome, email, telefone, senhaHash },
      });
      const membro = await tx.membroLoja.create({
        data: { lojaId: req.loja.id, usuarioId: usuario.id, papel },
        include: { usuario: true },
      });

      return { membro, usuarioExistente: false };
    });

    res.status(201).json({
      membro: membroPayload(resultado.membro),
      usuarioExistente: resultado.usuarioExistente,
      mensagem: resultado.usuarioExistente
        ? "Usuária vinculada à loja. Ela continuará usando a senha que já possuía."
        : "Acesso criado com sucesso.",
    });
  } catch (error) {
    console.error("Erro ao adicionar membro da equipe:", error);
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    if (error.code === "P2002") return res.status(409).json({ error: "Este e-mail já está em uso." });
    res.status(500).json({ error: "Não foi possível criar o acesso da usuária." });
  }
});

router.put("/:id", assinaturaAtivaRequired, async (req, res) => {
  const id = Number(req.params.id);
  const papel = req.body.papel === undefined ? undefined : textoLimpo(req.body.papel).toLowerCase();
  const ativo = req.body.ativo === undefined ? undefined : Boolean(req.body.ativo);

  if (!Number.isInteger(id)) return res.status(400).json({ error: "Membro inválido." });
  if (papel !== undefined && !PERFIS_EQUIPE.includes(papel)) {
    return res.status(400).json({ error: "Escolha o perfil vendedor ou gerente." });
  }

  try {
    const membroAtual = await prisma.membroLoja.findFirst({
      where: { id, lojaId: req.loja.id },
      include: { usuario: true },
    });

    if (!membroAtual) return res.status(404).json({ error: "Usuária não encontrada nesta loja." });
    if (membroAtual.usuarioId === req.usuario.id) {
      return res.status(400).json({ error: "Você não pode alterar o seu próprio acesso." });
    }
    if (membroAtual.papel === "admin") {
      return res.status(403).json({ error: "O acesso de outro administrador não pode ser alterado aqui." });
    }

    const membro = await prisma.membroLoja.update({
      where: { id },
      data: {
        ...(papel !== undefined ? { papel } : {}),
        ...(ativo !== undefined ? { ativo } : {}),
      },
      include: { usuario: true },
    });

    res.json(membroPayload(membro));
  } catch (error) {
    console.error("Erro ao atualizar membro da equipe:", error);
    res.status(500).json({ error: "Não foi possível atualizar o acesso." });
  }
});

module.exports = router;
