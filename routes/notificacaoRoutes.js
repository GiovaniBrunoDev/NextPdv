const express = require("express");
const { PrismaClient } = require("@prisma/client");
const {
  configuracaoPushDisponivel,
  enviarTesteParaUsuario,
} = require("../services/notificacaoPushService");

const router = express.Router();
const prisma = new PrismaClient();

router.get("/status", async (req, res) => {
  try {
    const dispositivos = await prisma.inscricaoPush.count({
      where: {
        lojaId: req.loja.id,
        usuarioId: req.usuario.id,
        ativo: true,
      },
    });

    return res.json({
      configurado: configuracaoPushDisponivel(),
      dispositivos,
    });
  } catch (error) {
    console.error("Erro ao consultar notificações:", error);
    return res.status(500).json({ error: "Não foi possível consultar as notificações." });
  }
});

router.get("/chave-publica", (req, res) => {
  if (!configuracaoPushDisponivel()) {
    return res.status(503).json({ error: "Notificações ainda não foram configuradas no servidor." });
  }

  return res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post("/inscricoes", async (req, res) => {
  try {
    if (!configuracaoPushDisponivel()) {
      return res.status(503).json({ error: "Notificações ainda não foram configuradas no servidor." });
    }

    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Inscrição de notificação inválida." });
    }

    const inscricao = await prisma.inscricaoPush.upsert({
      where: { endpoint: String(endpoint) },
      create: {
        lojaId: req.loja.id,
        usuarioId: req.usuario.id,
        endpoint: String(endpoint),
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
        userAgent: req.get("user-agent") || null,
      },
      update: {
        lojaId: req.loja.id,
        usuarioId: req.usuario.id,
        p256dh: String(keys.p256dh),
        auth: String(keys.auth),
        userAgent: req.get("user-agent") || null,
        ativo: true,
      },
    });

    return res.status(201).json({ id: inscricao.id, ativo: inscricao.ativo });
  } catch (error) {
    console.error("Erro ao ativar notificações:", error);
    return res.status(500).json({ error: "Não foi possível ativar as notificações." });
  }
});

router.delete("/inscricoes", async (req, res) => {
  try {
    const endpoint = String(req.body?.endpoint || "");
    if (!endpoint) return res.status(400).json({ error: "Informe o dispositivo." });

    await prisma.inscricaoPush.updateMany({
      where: {
        endpoint,
        lojaId: req.loja.id,
        usuarioId: req.usuario.id,
      },
      data: { ativo: false },
    });

    return res.json({ message: "Notificações desativadas neste dispositivo." });
  } catch (error) {
    console.error("Erro ao desativar notificações:", error);
    return res.status(500).json({ error: "Não foi possível desativar as notificações." });
  }
});

router.post("/teste", async (req, res) => {
  try {
    const resultado = await enviarTesteParaUsuario(prisma, {
      lojaId: req.loja.id,
      usuarioId: req.usuario.id,
    });

    if (!resultado.enviados) {
      return res.status(400).json({ error: "Nenhum dispositivo ativo recebeu a notificação." });
    }

    return res.json({ message: "Notificação de teste enviada.", ...resultado });
  } catch (error) {
    console.error("Erro ao testar notificações:", error);
    return res.status(500).json({ error: "Não foi possível enviar a notificação de teste." });
  }
});

module.exports = router;
