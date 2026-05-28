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
  const envUrl = origemValida(process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL);
  if (envUrl) return envUrl;

  const protocolo = String(req.headers["x-forwarded-proto"] || req.protocol || "http")
    .split(",")[0]
    .trim();
  return `${protocolo}://${req.get("host")}`;
}

function renderUploadPage(token) {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>Lojia - Enviar foto</title>
    <style>
      :root {
        --ink: #020C2C;
        --muted: #64748b;
        --line: #e5ded2;
        --green: #16a36b;
        --paper: #fffefa;
        --bg: #f7f5ef;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100dvh;
        overflow-x: hidden;
        background: var(--bg);
        color: var(--ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        display: grid;
        min-height: 100dvh;
        place-items: center;
        padding: 24px 16px;
      }
      .card {
        width: min(100%, 420px);
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 28px;
        background: var(--paper);
        padding: 22px;
        box-shadow: 0 24px 64px rgba(2, 12, 44, 0.14);
      }
      .header {
        display: flex;
        gap: 12px;
        align-items: center;
        margin-bottom: 20px;
      }
      .icon {
        display: grid;
        width: 46px;
        height: 46px;
        flex: 0 0 auto;
        place-items: center;
        border-radius: 18px;
        background: rgba(22, 163, 107, 0.12);
        color: var(--green);
        font-size: 22px;
        font-weight: 800;
      }
      h1 {
        margin: 0;
        font-size: 19px;
        line-height: 1.2;
      }
      p {
        margin: 5px 0 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.45;
      }
      .drop {
        display: grid;
        min-height: 290px;
        cursor: pointer;
        place-items: center;
        border: 1px dashed #cbd5e1;
        border-radius: 22px;
        background: #fff;
        padding: 24px;
        text-align: center;
      }
      .drop strong {
        display: block;
        margin-top: 12px;
        font-size: 15px;
      }
      .preview {
        display: none;
        width: 100%;
        height: 290px;
        border: 1px solid #e2e8f0;
        border-radius: 22px;
        object-fit: contain;
        background: white;
      }
      input[type="file"] {
        width: 100%;
        margin-top: 14px;
        color: var(--muted);
        font-size: 14px;
      }
      #fileAlt { display: none; }
      button {
        display: inline-flex;
        width: 100%;
        min-height: 48px;
        align-items: center;
        justify-content: center;
        margin-top: 18px;
        border: 0;
        border-radius: 18px;
        background: var(--ink);
        color: white;
        font-size: 15px;
        font-weight: 750;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
      .status {
        display: none;
        margin-top: 14px;
        border-radius: 18px;
        padding: 13px 14px;
        font-size: 14px;
        line-height: 1.4;
      }
      .status.ok {
        display: block;
        border: 1px solid rgba(22, 163, 107, 0.24);
        background: rgba(22, 163, 107, 0.1);
        color: #0f6c4c;
      }
      .status.error {
        display: block;
        border: 1px solid rgba(225, 29, 72, 0.2);
        background: rgba(225, 29, 72, 0.08);
        color: #be123c;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <div class="header">
          <div class="icon">L</div>
          <div>
            <h1>Enviar foto do produto</h1>
            <p>Escolha ou tire uma foto neste celular. Ela aparece automaticamente no cadastro aberto no computador.</p>
          </div>
        </div>

        <label class="drop" id="drop">
          <div>
            <div style="font-size: 34px; color: var(--green)">+</div>
            <strong>Escolher imagem no celular</strong>
            <p>Voce pode tirar uma foto agora ou selecionar uma imagem da galeria.</p>
          </div>
          <input id="file" type="file" accept="image/*" hidden />
        </label>

        <img id="preview" class="preview" alt="Previa do produto" />
        <input id="fileAlt" type="file" accept="image/*" />

        <button id="submit" type="button" disabled>Enviar imagem para a Lojia</button>
        <div id="status" class="status"></div>
      </section>
    </main>

    <script>
      const token = ${JSON.stringify(token)};
      const drop = document.getElementById("drop");
      const file = document.getElementById("file");
      const fileAlt = document.getElementById("fileAlt");
      const preview = document.getElementById("preview");
      const submit = document.getElementById("submit");
      const statusBox = document.getElementById("status");
      let selectedFile = null;

      function setStatus(message, type) {
        statusBox.textContent = message;
        statusBox.className = "status " + type;
      }

      function selectImage(input) {
        const image = input.files && input.files[0];
        if (!image) return;

        selectedFile = image;
        preview.src = URL.createObjectURL(image);
        preview.style.display = "block";
        drop.style.display = "none";
        fileAlt.style.display = "block";
        submit.disabled = false;
        statusBox.className = "status";
      }

      file.addEventListener("change", () => selectImage(file));
      fileAlt.addEventListener("change", () => selectImage(fileAlt));

      submit.addEventListener("click", async () => {
        if (!token) {
          setStatus("Link invalido. Gere um novo QR Code no computador.", "error");
          return;
        }

        if (!selectedFile) {
          setStatus("Escolha uma foto antes de enviar.", "error");
          return;
        }

        submit.disabled = true;
        submit.textContent = "Enviando...";

        try {
          const formData = new FormData();
          formData.append("imagem", selectedFile);

          const response = await fetch(window.location.pathname, {
            method: "POST",
            body: formData,
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || "Nao foi possivel enviar a imagem.");
          }

          setStatus("Imagem enviada. Agora volte ao computador para revisar e salvar o produto.", "ok");
          submit.textContent = "Enviar novamente";
        } catch (error) {
          setStatus(error.message || "Erro ao enviar imagem.", "error");
          submit.textContent = "Tentar novamente";
        } finally {
          submit.disabled = false;
        }
      });
    </script>
  </body>
</html>`;
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
    const frontendOrigin = origemValida(req.body.origin) || origemValida(req.headers.origin);
    const apiUrl = basePublica(req);
    const uploadUrl = frontendOrigin
      ? `${frontendOrigin}/upload-celular.html?token=${token}&api=${encodeURIComponent(apiUrl)}`
      : `${apiUrl}/mobile-upload/${token}`;

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

router.get("/:token", validarSessaoUpload, (req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderUploadPage(req.params.token));
});

router.post("/:token", validarSessaoUpload, upload.single("imagem"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Nenhuma imagem enviada." });

  const imageUrl = `${basePublica(req)}/uploads/lojas/${req.sessaoUpload.lojaId}/${req.file.filename}`;
  req.sessaoUpload.imageUrl = imageUrl;
  sessoes.set(req.params.token, req.sessaoUpload);

  res.json({ imageUrl });
});

module.exports = router;
