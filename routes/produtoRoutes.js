const express = require('express');
const router = express.Router();
const produtoController = require("../controllers/produtoController");
const { assinaturaAtivaRequired, requireRole, acessoAmploRequired } = require("../middlewares/auth");

router.get('/', produtoController.listarProdutos);
router.get('/buscar', produtoController.buscarProdutos);
router.post('/', assinaturaAtivaRequired, acessoAmploRequired, requireRole("admin", "gerente"), produtoController.criarProduto);
router.put('/:id', assinaturaAtivaRequired, acessoAmploRequired, requireRole("admin", "gerente"), produtoController.atualizarProduto);
router.delete('/:id', assinaturaAtivaRequired, acessoAmploRequired, requireRole("admin"), produtoController.deletarProduto);
router.patch('/variacoes/:id', assinaturaAtivaRequired, acessoAmploRequired, requireRole("admin", "gerente"), produtoController.atualizarEstoqueVariacao);
router.delete("/variacoes/:id", assinaturaAtivaRequired, acessoAmploRequired, requireRole("admin", "gerente"), produtoController.deletarVariacao);
router.post('/:id/variacoes', assinaturaAtivaRequired, acessoAmploRequired, requireRole("admin", "gerente"), produtoController.adicionarVariacao);
router.post('/upload', assinaturaAtivaRequired, acessoAmploRequired, requireRole("admin", "gerente"), produtoController.uploadImagem, produtoController.fazerUploadImagem);
router.get('/:id/imagem-download', produtoController.baixarImagemProduto);
router.get('/:id', produtoController.buscarProduto);



module.exports = router;
