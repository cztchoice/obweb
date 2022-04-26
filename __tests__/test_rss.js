//test_api.test.js
var rewire = require("rewire");
const fs = require('fs')
const { resolve } = require('path');
const TestRSS = rewire('../rss.js');
const RSS = rewire('../rss.js');
const AppDao = require('../dao.js');
const db_path = resolve("./__tests__/rss.db");

describe('basic route tests', () => {

    beforeEach(function() {
        if (fs.existsSync(db_path)) {
            fs.unlinkSync(db_path);
        }
    });

    test('rss fetch and parse', async() => {
        expect(fs.existsSync(db_path)).toBe(false);
        AppDao.db();
        expect(fs.existsSync(db_path)).toBe(true);
        await RSS.fetchFeed('https://www.quastor.org/feed');
    });

    test('rss test html extract', () => {
        let extract = TestRSS.__get__("extract_html");
        let html = `<div>
            <h1>title</h1>
            <p>content</p>
            `;
        let res = extract(html, "h1");
        expect(res).toBe("<h1>title</h1>");

        res = extract(html, "body");
        expect(res).toBe("");
    });

    test('rss test html remove_elements', () => {
        let remove_elems = TestRSS.__get__("remove_elems");
        let html = `<div>
            <h1>title</h1>
            <p>content</p>
            <footer>footer</footer>
            <header>header</header>
            `;
        let res = remove_elems(html, ["footer", "header"]);
        expect(res).toBe("<div><h1>title</h1><p>content</p></div>");

        html = `<div>
            <h1>title</h1>
            <body>
            content
            <footer>footer</footer>
            <header>header</header>
            </body>
            </div>`
        res = remove_elems(html, ["body"]);
        expect(res).toBe("<div><h1>title</h1></div>");
    });

    test('rss fetch page html', async() => {
        let fetch_page_content = TestRSS.__get__("fetch_page_content");
        let res = await fetch_page_content('http://catcoding.me');
        expect(res.indexOf('<article')).toBe(0);
    });

    test('preprocess_image', async() => {
        let preprocess_image = TestRSS.__get__("preprocess_image");
        let file = "./pages/images/8d274a6f8bfe9dd.png";
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
        let html = '<ul id="list"><li>Hello World</li><img src="https://catcoding.me/css/images/logo.png" alt=""></ul>';
        let res = await preprocess_image(html, "https://catcoding.me/atom.xml");
        expect(res.indexOf(file.replace("./", "/"))).toBeGreaterThan(0);

    });

});