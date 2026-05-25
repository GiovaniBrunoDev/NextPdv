const express = require('express');
const router = express.Router();
const produtoController = require("../controllers/produtoController");
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

router.get('/', produtoController.listarProdutos);
router.get('/buscar', produtoController.buscarProdutos);
router.post('/', assinaturaAtivaRequired, requireRole("admin", "gerente"), produtoController.criarProduto);
router.put('/:id', assinaturaAtivaRequired, requireRole("admin", "gerente"), produtoController.atualizarProduto);
router.delete('/:id', assinaturaAtivaRequired, requireRole("admin"), produtoController.deletarProduto);
router.patch('/variacoes/:id', assinaturaAtivaRequired, requireRole("admin", "gerente"), produtoController.atualizarEstoqueVariacao);
router.delete("/variacoes/:id", assinaturaAtivaRequired, requireRole("admin", "gerente"), produtoController.deletarVariacao);
router.post('/:id/variacoes', assinaturaAtivaRequired, requireRole("admin", "gerente"), produtoController.adicionarVariacao);
router.post('/upload', assinaturaAtivaRequired, requireRole("admin", "gerente"), produtoController.uploadImagem, produtoController.fazerUploadImagem);
router.get('/:id/imagem-download', produtoController.baixarImagemProduto);
router.get('/:id', produtoController.buscarProduto);



module.exports = router;
