const express = require('express');
const router = express.Router();
const produtoController = require("../controllers/produtoController");

router.get('/', produtoController.listarProdutos);
router.get('/:id', produtoController.buscarProduto);
router.post('/', produtoController.criarProduto); // Atualizado no controller p/ aceitar variacoes
router.put('/:id', produtoController.atualizarProduto);
router.delete('/:id', produtoController.deletarProduto);
router.patch('/variacoes/:id', produtoController.atualizarEstoqueVariacao);
router.delete("/variacoes/:id", produtoController.deletarVariacao);
router.post('/:id/variacoes', produtoController.adicionarVariacao);
router.post('/upload', produtoController.uploadImagem, produtoController.fazerUploadImagem);
router.get('/buscar', produtoController.buscarProdutos);



module.exports = router;
