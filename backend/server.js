const Koa = require('koa');
const app = new Koa();
const router = require('koa-router')();
const serve = require('koa-static')
const mount = require('koa-mount')
const logger = require('koa-logger')
const path = require('path')
const fs = require('fs')
const json = require('koa-json');
const bodyParser = require('koa-bodyparser');
const chinaTime = require('china-time');
const { resolve } = require('path');
const basicAuth = require('koa-basic-auth');
const dayjs = require('dayjs')
var isSameOrAfter = require('dayjs/plugin/isSameOrAfter')
dayjs.extend(isSameOrAfter)
var isSameOrBefore = require('dayjs/plugin/isSameOrBefore')
dayjs.extend(isSameOrBefore)

const { readdir } = require('fs').promises;
const RSS = require('./rss');
const config = require('config');
const Utils = require('./utils.js');
const session = require('koa-generic-session');
const SQLite3Store = require('koa-sqlite3-session');

var crypto = require('crypto');

const SERV_PATH = resolve(config.get("serv_path"));
const OBPATH = resolve(path.join(SERV_PATH, config.get("ob_name")));
const PAGESPATH = resolve(config.get("serv_path"), "pages");
const RSSIMAGES_PATH = resolve(path.join(SERV_PATH, "./pages/images"));
const DBPATH = resolve(config.get("db_path"));
const SQLDB = resolve(path.join(DBPATH, "store.db"));
const FRONTPATH = resolve(path.join(SERV_PATH, "front"));
const PORT = config.get("server.port");


[PAGESPATH, RSSIMAGES_PATH, DBPATH].forEach(function(path) {
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
    }
});

// logger
app.use(json());
app.use(logger());
app.use(bodyParser({
    'formLimit': '10mb',
    'jsonLimit': '10mb',
    'textLimit': '10mb',
}));

app.keys = [config.get("session_secret")];
app.use(session({
    store: new SQLite3Store(SQLDB, {}),
    cookie: {
        path: '/',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 * 21, //cookie valid for 21 days
        overwrite: true,
        signed: true
    }
}));

//app.use(basicAuth({ name: 'tj', pass: 'xxx' }));
function init() {
    let auth_user = config.get("basic_auth_user");
    if (auth_user) {
        app.use(basicAuth({
            name: auth_user,
            pass: config.get("basic_auth_pass")
        }));
    }
}


app.use(async(ctx, next) => {
    let white_list = ["/api/login", "/obweb"];
    console.log("ctx url: ", ctx.url);
    if (!ctx.url.match(/^\/front/) && white_list.indexOf(ctx.url) === -1) {
        await verify_login(ctx);
    }
    if (ctx.status != 401) {
        await next();
    }
});

// error handling
app.use(async(ctx, next) => {
    try {
        await next();
    } catch (err) {
        ctx.status = err.status || 500;
        ctx.body = err.message;
        ctx.app.emit('error', err, ctx);
    }
});

// response
async function verify_login(ctx) {
    ctx.body = "unauthorized";
    ctx.status = 401;
    const { session } = ctx
    if (session.user) {
        ctx.body = "ok";
        ctx.status = 200;
        return;
    }
}

async function user_login(ctx) {
    const body = ctx.request.body;
    let username = body['username'];
    let password = body['password'];
    let user = config.get("user");
    let pass = config.get("pass");
    if (user && pass && user == username && pass == password) {
        let token = crypto.randomBytes(12).toString('hex');
        const { session } = ctx
        session.token = token
        session.user = { username: username };
        ctx.body = "ok";
        ctx.status = 200;
    } else {
        ctx.body = "failed";
        ctx.status = 401;
    }
}

async function getFiles(dir, isRecursion = true) {
    const dirents = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const path = resolve(dir, dirent.name);
        let obj = {
            path: path,
            time: fs.statSync(path).mtime.getTime()
        }
        return (dirent.isDirectory() && isRecursion ) ? getFiles(path) : obj;
    }));
    return Array.prototype.concat(...files);
}

async function getFilenames(dir, isRecursion = true, filter_func = (filename) => true) {
    let file_paths = await getFiles(dir, isRecursion);
    let filenames = [];
    for (const file_path of file_paths) {
        let filename = path.basename(file_path.path);
        if (filter_func && filter_func(filename)) {
            filenames.push(filename);
        }
    }
    return filenames;
}

async function getDailyFilenames(dir, isRecursion = true, filter_func = (filename) => true) {
    let daily_path = path.join(OBPATH, `journals`);
    const regex = /^20\d\d-\d\d-\d\d\.md$/;
    let filenames = await getFilenames(daily_path, false, (filename) => {
        return regex.test(filename);
    });
    filenames.sort();
    return filenames;
}

async function get_page(ctx) {
    Utils.gitPull(true);
    const query = ctx.request.query;
    let query_path = query['path'];
    let query_type = Utils.get_or(query['query_type'], "page");
    if (query_type === "rss") {
        const data = RSS.getRss(query_path);
        console.log(data);
        if (data.length > 0) {
            RSS.setRssReaded(query_path);
            let title = data[0].title;
            let rss_path = resolve(path.join(PAGESPATH, `${data[0].id}.html`));
            let rss_page = Utils.safeRead(rss_path, 'utf-8');
            ctx.body = [title, rss_page, query_path, dayjs(data[0].publish_datetime).format("YYYY.MM.DD")];
        } else {
            ctx.body = "NoPage";
        }
    } else {
        let file_path;
        if (query_type === "daily_next") {
            // 当是 daily_next 或者 daily_prev 时，自己去寻找下一个、上一个日历文件
            cur_day_str = path.basename(query_path).replace('.md', '');
            let cur_day = dayjs(cur_day_str);
            let next_day = cur_day.add(1, 'day');

            let filenames = await getDailyFilenames();

            for (let i =  0; i < filenames.length; i++) {
                let filename = filenames[i];
                let file_day_str = filename.replace('.md', '');
                let file_day = dayjs(file_day_str);
                if (file_day.isSameOrAfter(next_day, 'day')) {
                    file_path = `journals/${file_day_str}`;
                    break;
                }
            }

        } else if (query_type === "daily_prev") {
            cur_day_str = path.basename(query_path).replace('.md', '');
            let cur_day = dayjs(cur_day_str);
            let prev_day = cur_day.subtract(1, 'day');

            let filenames = await getDailyFilenames();

            for (let i = filenames.length - 1; i >= 0; i--) {
                let filename = filenames[i];
                let file_day_str = filename.replace('.md', '');
                let file_day = dayjs(file_day_str);
                if (file_day.isSameOrBefore(prev_day, 'day')) {
                    file_path = `journals/${file_day_str}`;
                    break;
                }
            }
        } else {
            file_path = query_path;
        }
        if (file_path === undefined) {
            ctx.body = ["NoPage", ""];
        } else {
            let page_path = path.join(OBPATH, `${file_path}.md`);
            console.log("get page_page: ", page_path);
            if (fs.existsSync(page_path)) {
                let content = Utils.safeRead(page_path, 'utf-8');
                ctx.body = [Utils.strip_ob(page_path), content];
            } else {
                ctx.body = ["NoPage", ""];
            }
        }
    }
}

async function post_page(ctx) {
    const body = ctx.request.body;
    let fpath = body['file'];
    let page_path = path.join(OBPATH, `/${fpath}`);
    if (fs.existsSync(page_path)) {
        let content = body['content'];
        fs.writeFileSync(page_path, content);
        Utils.gitSync();
        ctx.status = 200;
    } else {
        ctx.body = ["NoPage", ""];
        ctx.status = 404;
    }
}

async function search(ctx) {
    Utils.gitPull(true);
    let query = ctx.request.query;
    let keyword = Utils.get_or(query['keyword'], "");
    let result = await getFiles(OBPATH)
        .then(files => {
            return files.filter(file => {
                let path = file.path;
                if (path.indexOf(".md") != -1) {
                    let content = Utils.safeRead(path, 'utf-8');
                    return (keyword.length == 0 || content.indexOf(keyword) != -1);
                }
                return false;
            });
        })
        .catch(e => console.error(e));
    let max_len = keyword.length == 0 ? 20 : result.length;
    result.sort((a, b) => b.time - a.time);
    result = result.slice(0, max_len);
    let res = result.map(f => {
        let path = Utils.strip_ob(f.path.replace(".md", ""));
        return `<li><a id=\"${path}\" href=\"#\">${path}</a></li>`;
    }).join("")
    ctx.body = res
}

function get_rss(ctx) {
    let query = ctx.request.query;
    let read = query['query_type'] === "unread" ? 0 : 1;
    let limit = 30;
    const data = RSS.getRssPages(read, limit);
    let res = "";
    for (let i = 0; i < data.length; i++) {
        let item = data[i];
        let cl = item.readed ? "visited" : "";
        res += `<li><a class=\"${cl}\" id=\"${item.link}\", href=\"#\">${item.title}</a></li>`;
    }
    ctx.body = res;
}

function rss_mark(ctx) {
    RSS.rss_mark(15);
}

async function todo_mark(ctx) {
    ctx.status = 404;
}

async function post_entry(ctx) {
    let date_str = chinaTime('YYYY-MM-DD');
    let time_str = chinaTime('HH:mm');
    let body = ctx.request.body;
    let page = body['page']
    let path = Utils.gen_path(page, date_str);
    let data = Utils.safeRead(path, 'utf-8');

    if (page == "" && data.length == 0) {
        data = `## ${date_str}`;
    }
    let text = body['text'];
    let links = body['links'];
    let content = page != "" ? `\n### ${date_str} ${time_str}` : `\n## ${time_str}`;
    if (links.length > 0) {
        let link_str = links.split(",").map(l => `[[${l}]]`).join(" ");
        content += `\nLinks: ${link_str}`;
    }
    let append = page == "todo" ? `- [ ] ${text}` : text;
    content += `\n${append}`;
    let image = body['image'];
    if (image != "") {
        var ext = image.split(';')[0].match(/jpeg|png|gif/)[0];
        var image_data = image.replace(/^data:image\/\w+;base64,/, "");
        var buf = Buffer.from(image_data, 'base64');
        let image_name = `obweb-${chinaTime('YYYY-MM-DD-HH-mm-ss')}.${ext}`;
        let image_path = `${OBPATH}/Pics/${image_name}`;
        fs.writeFileSync(image_path, buf, { flag: 'w+' });
        content += `\n\n![[${image_name}|250]]\n`;
    }
    content = page == "todo" ? `${content}\n\n---\n\n${data}` : `${data}\n${content}`;
    fs.writeFileSync(path, content, 'utf-8');
    Utils.gitSync();
    ctx.body = "ok"
}

router.get('/', async(ctx, next) => {
        ctx.body = "Hello World!";
    })
    .get('/api/page', get_page)
    .post('/api/page', post_page)
    .get('/api/search', search)
    .post('/api/entry', post_entry)
    .get('/api/verify', verify_login)
    .post('/api/login', user_login)
    .get('/api/rss', get_rss)
    .post('/api/rss_mark', rss_mark)
    .post('/api/mark', todo_mark);

router.all('/obweb', ctx => {
    ctx.redirect('/front/index.html');
    ctx.status = 301;
});

app.use(mount('/front', serve(path.join(FRONTPATH, 'public'))));
app.use(mount('/pages/images/', serve(RSSIMAGES_PATH)));
app.use(mount('/static/images/', serve(`${OBPATH}/Pics`)));


app.use(router.routes())
    .use(router.allowedMethods());

const server = app.listen(PORT);
module.exports = server;