const express = require("express");
const path = require("path");
const fs = require("fs");
const router = express.Router();
const htmlPath = path.join(__dirname, "../public/temp.html");
const jsonPath = path.join(__dirname, "../public/temp.json");

const user_agent = 
    process.env.USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36";

router.get("/api/utopia/*path", async (req, res) => {
    const path = (req.params.path || []).join("/");
    console.log(path);
    try{
        const r = await fetch(
            //"https://www.kyoshin.bosai.go.jp/kyoshin/webservice/real_time.json",
            `https://nana.utopia.drciocan.ro/${path || ""}`,
            //"https://www.data.jma.go.jp/svd/eqev/data/real_time/intensity.json%0A",
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        const text = await r.text();

        if (path == "js/all.js") fs.writeFileSync(htmlPath, text);

        //const data = JSON.parse(text);
        res.send(text);
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});

router.get("/api/utopia", async (req, res) => {
    try{
        const r = await fetch(
            //"https://www.kyoshin.bosai.go.jp/kyoshin/webservice/real_time.json",
            `https://nana.utopia.drciocan.ro`,
            //"https://www.data.jma.go.jp/svd/eqev/data/real_time/intensity.json%0A",
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        const text = await r.text();

        fs.writeFileSync(htmlPath, text);

        //const data = JSON.parse(text);
        res.send(text);
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});

router.get("/api/5000generator/*path", async (req, res) => {
    const path = (req.params.path || []).join("/");
    console.log(path);
    try{
        const r = await fetch(
            //"https://www.kyoshin.bosai.go.jp/kyoshin/webservice/real_time.json",
            `https://5000generator.auriga.dev/${path || ""}`,
            //"https://www.data.jma.go.jp/svd/eqev/data/real_time/intensity.json%0A",
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        const text = await r.text();

        fs.writeFileSync(htmlPath, text);

        //const data = JSON.parse(text);
        res.send(text);
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});

router.get("/gitlab/tetris/*path", async (req, res) => {
    const path = (req.params.path || []).join("/");
    console.log(path);
    try{
        const r = await fetch(
            //"https://www.kyoshin.bosai.go.jp/kyoshin/webservice/real_time.json",
            `https://tetris-053217.gitlab.io/${path || ""}`,
            //"https://www.data.jma.go.jp/svd/eqev/data/real_time/intensity.json%0A",
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        const text = await r.text();

        fs.writeFileSync(htmlPath, text);

        //const data = JSON.parse(text);
        res.send(text);
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});

router.get("/api/atmos", async (req, res) => {
    try{
        const r = await fetch(
            //"https://www.kyoshin.bosai.go.jp/kyoshin/webservice/real_time.json",
            `https://www.demolandia.net/downloads.html?id=236762`,
            //"https://www.data.jma.go.jp/svd/eqev/data/real_time/intensity.json%0A",
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        const text = await r.text();

        //fs.writeFileSync(jsonPath, text);

        //const data = JSON.stringify(text);
        res.send(text);
        /*const arrayBuffer = await text.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.end(buffer);*/
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});

router.get("/api/ofoct", async (req, res) => {
    try{
        const r = await fetch(`https://www.ofoct.com/audio-converter/convert-wav-or-mp3-ogg-aac-wma-to-midi.html`,
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        let text = await r.text();

        //const data = JSON.parse(text);
        //res.pipe(r);

        text = text.replace(
            "maxFileSize:,",
            "maxFileSize: 104857600,"
        ).replace(
            "/wp-content/",
            "https://www.ofoct.com/wp-content/"
        ).replace(
            "/wp-content/themes/catch-box/js/index_all.js",
            "https://www.ofoct.com/wp-content/themes/catch-box/js/index_all.js"
        ).replace(
            "/account/","https://www.ofoct.com/account/"
        ).replace(
            "/account/panel.php","https://www.ofoct.com/account/panel.php"
        ).replace(
            "/account/login.php","https://www.ofoct.com/account/login.php"
        ).replace(
            "/account/userInfo.php","https://www.ofoct.com/account/userInfo.php"
        ).replace(
            "/account/buy.php","https://www.ofoct.com/account/buy.php"
        ).replace(
            'var geturl = "https://cts.ofoct.com/upload_from_url.php?url=" + encodeURIComponent(vurl) + "&input_format=" + inputfmt;',
            "var getutl = vurl;"
        );

        fs.writeFileSync(htmlPath, text);

        /*const arrayBuffer = await text.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);*/

        res.setHeader("Content-Type", "text/html");
        //res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=86400");
        res.send(text);
        //res.end(buffer);
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});

router.get("/api/neo2stats", async (req, res) => {
    try{
        const r = await fetch(`https://neo2stats.f5.si`,
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        //const text = await r.text();

        fs.writeFileSync(htmlPath, r);

        //const data = JSON.parse(text);
        //res.pipe(r);
        const arrayBuffer = await r.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=86400");

        res.end(buffer);
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});

router.get("/api/neo2stats/:url", async (req, res) => {
    const url = req.params.url || null;
    if (url == null) return;
    try{
        const r = await fetch(`https://neo2stats.f5.si/${url}`,
            {
                headers: {
                    "User-Agent": user_agent
                    //"Accept": "application/json"
                }
            }
        );

        //const text = await r.text();

        fs.writeFileSync(htmlPath, r);

        //const data = JSON.parse(text);
        //res.pipe(r);
        const arrayBuffer = await r.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        res.setHeader("Content-Type", "image/png");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "public, max-age=86400");

        res.end(buffer);
    } catch (e) {
        console.error(e.message);
        res.send(e);
    }
});


module.exports = router;