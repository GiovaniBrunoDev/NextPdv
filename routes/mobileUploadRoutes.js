const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const { authRequired, lojaRequired, assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

const router = express.Router();
const sessoes = new Map();
const TEMPO_EXPIRACAO_MS = 15 * 60 * 1000;
const pastaUploads = path.join(__dirname, "../uploads");

function limparSessoesExpiradas() {
  const agora = Date.now();
  for (const [token, sessao] of sessoes.entries()) {
    if (sessao.expiraEm <= agora) sessoes.delete(token);
  }
}

function origemValida(valor) {
  const origem = String(valor || "").trim();
  if (!origem) return null;
  try {
    const url = new URL(origem);
    return url.origin;
  } catch {
    return null;
  }
}

function basePublica(req) {
  const protocolo = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  return `${protocolo}://${req.get("host")}`;
}

function validarSessaoUpload(req, res, next) {
  limparSessoesExpiradas();
  const sessao = sessoes.get(req.params.token);
  if (!sessao) return res.status(404).json({ error: "Sessao de upload expirada." });
  req.sessaoUpload = sessao;
  next();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const lojaId = req.sessaoUpload?.lojaId;
    const pastaLoja = path.join(pastaUploads, "lojas", String(lojaId));
    fs.mkdirSync(pastaLoja, { recursive: true });
    cb(null, pastaLoja);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".jpg";
    cb(null, `mobile-${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (!file.mimetype?.startsWith("image/")) return cb(new Error("Envie uma imagem valida."));
    cb(null, true);
  },
  limits: { fileSize: 8 * 1024 * 1024 },
});

router.post(
  "/sessoes",
  authRequired,
  lojaRequired,
  assinaturaAtivaRequired,
  requireRole("admin", "gerente"),
  (req, res) => {
    limparSessoesExpiradas();

    const token = crypto.randomUUID();
    const origin = origemValida(req.body.origin) || origemValida(req.headers.origin) || "";
    const uploadUrl = origin ? `${origin}/upload-celular.html?token=${token}` : `/upload-celular.html?token=${token}`;

    sessoes.set(token, {
      token,
      lojaId: req.loja.id,
      usuarioId: req.usuario.id,
      imageUrl: null,
      criadoEm: Date.now(),
      expiraEm: Date.now() + TEMPO_EXPIRACAO_MS,
    });

    res.status(201).json({ token, uploadUrl, expiraEm: new Date(Date.now() + TEMPO_EXPIRACAO_MS) });
  }
);

router.get(
  "/sessoes/:token",
  authRequired,
  lojaRequired,
  requireRole("admin", "gerente"),
  (req, res) => {
    limparSessoesExpiradas();
    const sessao = sessoes.get(req.params.token);
    if (!sessao || sessao.lojaId !== req.loja.id) {
      return res.status(404).json({ error: "Sessao de upload nao encontrada." });
    }

    res.json({ token: sessao.token, imageUrl: sessao.imageUrl, expiraEm: new Date(sessao.expiraEm) });
  }
);

router.post("/:token", validarSessaoUpload, upload.single("imagem"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });

  const imageUrl = `${basePublica(req)}/uploads/lojas/${req.sessaoUpload.lojaId}/${req.file.filename}`;
  req.sessaoUpload.imageUrl = imageUrl;
  sessoes.set(req.params.token, req.sessaoUpload);

  res.json({ imageUrl });
});

module.exports = router;
