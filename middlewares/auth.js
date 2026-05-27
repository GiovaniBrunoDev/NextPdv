const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PERFIS = {
  admin: ["admin", "gerente", "vendedor"],
  gerente: ["gerente", "admin"],
  vendedor: ["vendedor", "gerente", "admin"],
};

function signToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      email: usuario.email,
      superadmin: usuario.superadmin,
    },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
  );
}

function assinaturaOperacionalAtiva(assinatura) {
  if (!assinatura) return false;
  if (!["trial", "ativa"].includes(assinatura.status)) return false;
  return new Date(assinatura.venceEm).getTime() >= Date.now();
}

async function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: "Login obrigatorio." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(payload.sub) },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        superadmin: true,
        ativo: true,
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

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: "Usuario invalido ou inativo." });
    }

    req.usuario = usuario;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Sessao expirada. Faça login novamente." });
  }
}

function lojaRequired(req, res, next) {
  const lojaHeader = Number(req.headers["x-loja-id"] || 0);
  const membros = req.usuario?.membros || [];
  const membro = lojaHeader
    ? membros.find((item) => item.lojaId === lojaHeader)
    : membros[0];

  if (!membro) {
    return res.status(403).json({ error: "Usuario sem acesso a esta loja." });
  }

  if (!membro.loja?.ativa) {
    return res.status(403).json({ error: "Loja inativa." });
  }

  req.membroLoja = membro;
  req.loja = membro.loja;
  req.assinaturaAtiva = assinaturaOperacionalAtiva(membro.loja.assinatura);
  next();
}

function assinaturaAtivaRequired(req, res, next) {
  if (!req.assinaturaAtiva) {
    return res.status(402).json({
      error: "Assinatura vencida. Regularize o plano para continuar operando.",
    });
  }
  next();
}

function requireRole(...perfisPermitidos) {
  return (req, res, next) => {
    if (req.usuario?.superadmin) return next();

    const papel = req.membroLoja?.papel;
    if (perfisPermitidos.includes(papel)) return next();

    return res.status(403).json({ error: "Permissao insuficiente." });
  };
}

function requireSuperadmin(req, res, next) {
  if (req.usuario?.superadmin) return next();
  return res.status(403).json({ error: "Acesso restrito ao superadmin." });
}

function canAccess(requiredRole, papel) {
  return PERFIS[requiredRole]?.includes(papel) || false;
}

module.exports = {
  prisma,
  signToken,
  authRequired,
  lojaRequired,
  assinaturaAtivaRequired,
  requireRole,
  requireSuperadmin,
  assinaturaOperacionalAtiva,
  canAccess,
};
