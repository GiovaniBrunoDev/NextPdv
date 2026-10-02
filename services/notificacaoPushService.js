const webpush = require("web-push");

function configuracaoPushDisponivel() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configurarWebPush() {
  if (!configuracaoPushDisponivel()) return false;

  webpush.setVapidDetails(
    process.env.WEB_PUSH_CONTACT || "mailto:suporte@lojia.app",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

async function enviarParaInscricoes(client, inscricoes, payload) {
  if (!configurarWebPush() || !inscricoes.length) return { enviados: 0, falhas: 0 };

  const resultados = await Promise.allSettled(
    inscricoes.map(async (inscricao) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: inscricao.endpoint,
            keys: { p256dh: inscricao.p256dh, auth: inscricao.auth },
          },
          JSON.stringify(payload),
          { TTL: 3600, urgency: "high" }
        );
        return true;
      } catch (error) {
        if ([404, 410].includes(Number(error.statusCode))) {
          await client.inscricaoPush.updateMany({
            where: { id: inscricao.id },
            data: { ativo: false },
          });
        }
        throw error;
      }
    })
  );

  const enviados = resultados.filter((resultado) => resultado.status === "fulfilled").length;
  return { enviados, falhas: resultados.length - enviados };
}

async function notificarNovoPedido(client, { lojaId, pedido, criadoPorId, criadoPorNome }) {
  if (!configuracaoPushDisponivel()) return { enviados: 0, falhas: 0 };

  const administradores = await client.membroLoja.findMany({
    where: {
      lojaId,
      ativo: true,
      usuario: { ativo: true },
      OR: [
        { papel: "admin" },
        { usuario: { superadmin: true } },
      ],
    },
    select: { usuarioId: true },
  });

  const destinatarios = [...new Set(administradores.map((membro) => membro.usuarioId))]
    .filter((usuarioId) => usuarioId !== criadoPorId);
  if (!destinatarios.length) return { enviados: 0, falhas: 0 };

  const inscricoes = await client.inscricaoPush.findMany({
    where: {
      lojaId,
      usuarioId: { in: destinatarios },
      ativo: true,
    },
  });

  const cliente = pedido.cliente?.nome || "Cliente não informado";
  const autor = criadoPorNome || "Equipe";
  return enviarParaInscricoes(client, inscricoes, {
    title: "Novo pedido",
    body: `${autor} criou o pedido #${pedido.id} · ${cliente} · ${formatarMoeda(pedido.total)}`,
    icon: "/lojia-icon.svg",
    badge: "/lojia-icon.svg",
    tag: `pedido-${pedido.id}`,
    url: "/?tela=pedidos",
    tela: "pedidos",
    pedidoId: pedido.id,
    badgeCount: 1,
  });
}

async function notificarVendaPedidoConfirmada(client, { lojaId, usuarioId, pedidoId, venda }) {
  if (!configuracaoPushDisponivel() || !usuarioId) return { enviados: 0, falhas: 0 };

  const inscricoes = await client.inscricaoPush.findMany({
    where: {
      lojaId,
      usuarioId,
      ativo: true,
    },
  });

  const cliente = venda.cliente?.nome || "Cliente não informado";
  return enviarParaInscricoes(client, inscricoes, {
    title: "Venda confirmada",
    body: `O pedido #${pedidoId} de ${cliente} virou a venda #${venda.id} · ${formatarMoeda(venda.total)}`,
    icon: "/lojia-icon.svg",
    badge: "/lojia-icon.svg",
    tag: `pedido-confirmado-${pedidoId}`,
    url: "/?tela=historico",
    tela: "historico",
    pedidoId,
    vendaId: venda.id,
    badgeCount: 1,
  });
}

async function enviarTesteParaUsuario(client, { lojaId, usuarioId }) {
  const inscricoes = await client.inscricaoPush.findMany({
    where: { lojaId, usuarioId, ativo: true },
  });

  return enviarParaInscricoes(client, inscricoes, {
    title: "Notificações da Lojia ativadas",
    body: "Tudo certo. Você receberá avisos sobre novos pedidos e vendas confirmadas.",
    icon: "/lojia-icon.svg",
    badge: "/lojia-icon.svg",
    tag: "teste-notificacoes",
    url: "/?tela=pedidos",
    tela: "pedidos",
  });
}

module.exports = {
  configuracaoPushDisponivel,
  notificarNovoPedido,
  notificarVendaPedidoConfirmada,
  enviarTesteParaUsuario,
};
