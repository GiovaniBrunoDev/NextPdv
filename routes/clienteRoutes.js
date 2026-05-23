const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { assinaturaAtivaRequired, requireRole } = require("../middlewares/auth");

router.post('/', assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), clienteController.criarCliente);
router.get('/', clienteController.listarClientes);
router.get('/:id', clienteController.buscarCliente);
router.put('/:id', assinaturaAtivaRequired, requireRole("admin", "gerente", "vendedor"), clienteController.atualizarCliente);
router.delete('/:id', assinaturaAtivaRequired, requireRole("admin", "gerente"), clienteController.deletarCliente);

module.exports = router;
