const express = require("express");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const upload = require("../middlewares/upload");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

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

        if (!file) {
            return res.status(400).json({ error: "Nenhum arquivo enviado" });
        }

        // 🔤 SLUG
        const slug = nomeProduto
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

        const videoKey = `catalogo/${slug}-${uuidv4()}.mp4`;
        const gifKey = `catalogo/gifs/${slug}-${uuidv4()}.gif`;

        // 📁 salvar vídeo temporário
        const tempVideoPath = path.join(__dirname, "../tmp-video.mp4");
        const tempGifPath = path.join(__dirname, "../tmp.gif");

        fs.writeFileSync(tempVideoPath, file.buffer);

        // 🚀 1. UPLOAD VÍDEO R2
        await r2.send(
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: videoKey,
                Body: file.buffer,
                ContentType: file.mimetype,
            })
        );

        // 🎬 2. GERAR GIF (equivalente ao seu script Python)
        await new Promise((resolve, reject) => {
            ffmpeg(tempVideoPath)
                .setStartTime(0)
                .duration(5)
                .outputOptions([
                    "-vf",
                    "fps=10,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=64[p];[s1][p]paletteuse",
                ])
                .output(tempGifPath)
                .on("end", resolve)
                .on("error", reject)
                .run();
        });

        // 📤 4. Upload GIF pro R2
        const gifBuffer = fs.readFileSync(tempGifPath);

        await r2.send(
            new PutObjectCommand({
                Bucket: process.env.R2_BUCKET,
                Key: gifKey,
                Body: gifBuffer,
                ContentType: "image/gif",
            })
        );

        // 🧹 limpar arquivos temporários
        fs.unlinkSync(tempVideoPath);
        fs.unlinkSync(tempGifPath);

        const videoUrl = `${process.env.R2_PUBLIC_URL}/${videoKey}`;
        const gifUrl = `${process.env.R2_PUBLIC_URL}/${gifKey}`;

        res.json({ videoUrl, gifUrl, url: videoUrl });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erro ao processar vídeo" });
    }
});

module.exports = router;
