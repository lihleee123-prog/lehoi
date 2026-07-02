const https = require('https');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const IMG_DIR = path.join(ASSETS_DIR, 'img');
const JS_DIR = path.join(ASSETS_DIR, 'js');
const CSS_DIR = path.join(ASSETS_DIR, 'css');

[ASSETS_DIR, FONTS_DIR, IMG_DIR, JS_DIR, CSS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };
        https.get(url, options, function(response) {
            response.pipe(file);
            file.on('finish', function() {
                file.close(resolve);
            });
        }).on('error', function(err) {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

async function run() {
    try {
        console.log("Downloading Tailwind CSS...");
        await download('https://cdn.tailwindcss.com?plugins=forms,container-queries', path.join(JS_DIR, 'tailwindcss.js'));

        console.log("Downloading Backgrounds...");
        await download('https://lh3.googleusercontent.com/aida-public/AB6AXuBt9_8rGgFI0M7PCkiRy7XVcJsSdqtXbbIsvM8Mawx4IHA4CYs85-KrzdL2VpYv5YRxHwzSeNXmsiMJGXEHeBKsHEPZzxxnTksKxx9pbKxvhN13nSDIe8I-PlCjxlkGecWLu0auSHYinDEswe6anf1ykJXYdZtOZ0KzcyBiJOKtiXa4LCeesR77RAIKOLSZgvHR7tlfG6L1gA74Q3PPtVyOachqUXAxR3vKyjQBn8FNPjIAJ2PbpvLxf2bNye29eLLLX8w3PLyXd_8', path.join(IMG_DIR, 'bg1.jpg'));
        await download('https://lh3.googleusercontent.com/aida-public/AB6AXuDhMjjTTZgd4_vHjQSWWAO1YUSLUGU-nU_jEl1B2o3pIjgnGfymVmrzdR74Ui5LhjS4oIZRx78Etct46Ygeg6mhTf_lYLfPWZQ96S75F4ty6KNuke0gS39jne5MQc5U0ZmFoZz7-tsKmnMJ2tiYqg-DEUMVpW5NAuj4Q0SJvw5rImBJ3DYIbjTi1hM4F2tIAWbo8si_EnWFECM9XORnafyeGnu71YxACu54Qwe_Dh7PCZPjkHDU6drJvSljLcRNMdzgnqNTOUsHv7w', path.join(IMG_DIR, 'bg2.jpg'));

        console.log("Downloading Google Fonts CSS...");
        // Manrope
        await download('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap', path.join(CSS_DIR, 'manrope.css'));
        // Material Symbols
        await download('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap', path.join(CSS_DIR, 'material-symbols.css'));

        // Parse and download font files
        const processCSS = async (cssFile) => {
            let css = fs.readFileSync(cssFile, 'utf8');
            const urlRegex = /url\((https:\/\/[^\)]+)\)/g;
            let match;
            let fileIndex = 1;
            while ((match = urlRegex.exec(css)) !== null) {
                const fontUrl = match[1];
                const ext = fontUrl.split('.').pop() || 'woff2';
                const fontName = path.basename(cssFile, '.css') + '-' + fileIndex + '.' + ext;
                const destPath = path.join(FONTS_DIR, fontName);
                
                console.log(`Downloading font file: ${fontUrl}`);
                await download(fontUrl, destPath);
                
                // Replace in CSS
                css = css.replace(fontUrl, `../fonts/${fontName}`);
                fileIndex++;
            }
            fs.writeFileSync(cssFile, css);
        };

        await processCSS(path.join(CSS_DIR, 'manrope.css'));
        await processCSS(path.join(CSS_DIR, 'material-symbols.css'));

        console.log("All assets downloaded successfully!");
    } catch (e) {
        console.error(e);
    }
}
run();
