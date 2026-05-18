const express = require("express");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const upload = require("../middlewares/upload");

const router = express.Router();

const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY,
        secretAccessKey: process.env.R2_SECRET_KEY,
    },
});

router.post("/upload-video", upload.single("video"), async (req, res) => {
    try {
        const file = req.file;
        const nomeProduto = req.body.nomeProduto || "produto";

        const slug = nomeProduto
            .toLowerCase()
            .normalize("NFD") // remove acentos
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-") // troca espaços por -
            .replace(/^-+|-+$/g, ""); // remove - do começo/fim

        if (!file) {
            return res.status(400).json({ error: "Nenhum arquivo enviado" });
        }

        const fileName = `catalogo/${slug}-${uuidv4()}.mp4`;

        await r2.send(
            
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: fileName,
                Body: file.buffer,
                ContentType: file.mimetype,
            })
        );

        const url = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        res.json({ url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao enviar vídeo" });
    }
});

module.exports = router;