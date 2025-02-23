<script>
    import { onMount } from "svelte";
    import dayjs from "dayjs";
    const jq = window.$;

    export let cur_page;
    export let cur_time;
    let page_content_hidden = true;
    let global_date = new Date();
    let file = "";
    let content = "";
    let show_status = false;
    let show_rsslink = false;
    let search_input = "";
    let in_edit = false;
    let rsslink = "";
    let publish_time = "";
    let rss_query_type = "unread";

    export const refresh = (cur) => {
        if (cur_page == "day") {
            getDaily(global_date);
        } else if (cur_page == "rand") {
            fetchPage("", "rand");
        } else if (cur_page == "todo") {
            fetchPage("Unsort/todo");
        } else if (cur_page == "rss") {
            fetchRss();
        } else if (cur_page == "find") {
            search();
        }
    };

    $: {
        console.log(cur_time);
        if (cur_page) {
            refresh(cur_page);
        }
    }

    function padding(value, n) {
        return String(value).padStart(n, "0");
    }

    function dateStr(date) {
        return (
            date.getFullYear() +
            "-" +
            padding(date.getMonth() + 1, 2) +
            "-" +
            padding(date.getDate(), 2)
        );
    }

    function nextDaily() {
        let date_str = dateStr(global_date);
        fetchPage(date_str, "daily_next");
    }

    function prevDaily() {
        let date_str = dateStr(global_date);
        fetchPage(date_str, "daily_prev");
    }

    function getDaily(date) {
        let date_str = dateStr(date);
        fetchPage(`journals/${date_str}`);
    }

    function preprocessImage(response) {
        let result = "";
        let left = response;
        let last = 0;
        while (left.indexOf("![[") != -1) {
            let prev = left.substring(0, left.indexOf("![["));
            result += prev;
            let start = left.indexOf("![[") + 3;
            let end = left.indexOf("]]", start);
            let image = left.substring(start, end);
            let image_url = image.split("|")[0].trim();
            result += "![img](/static/images/" + encodeURI(image_url) + ")";
            left = left.substring(end + 2);
            last = end + 2;
        }
        result += left;
        return result;
    }

    function markDone(index) {
        show_status = true;
        jq.ajax({
            url: "/api/mark?index=" + index,
            type: "POST",
            success: function (response) {
                if (response == "done") {
                    fetchPage("Unsort/todo");
                }
            },
            error: function (err) {
                show_status = false;
                console.log("Error: ", err);
            },
        });
    }

    function adjustTodo() {
        if (cur_page == "todo") {
            jq("input:checkbox").each(function (index) {
                jq(this).prop("id", index);
            });

            jq("input:checkbox:not(:checked)").each(function () {
                let parent = jq(this).parent();
                jq(this).prop("disabled", false);
                parent.css("color", "red");
                parent.css("font-weight", "bold");
            });

            jq("input:checkbox:not(:checked)").change(function () {
                if (jq(this).is(":checked")) {
                    markDone(jq(this).prop("id"));
                }
            });
        }
    }

    function preprocessLink(response) {
        let result = "";
        let last = 0;
        let left = response;
        while (left.indexOf("[[") != -1) {
            let prev = left.substring(0, left.indexOf("[["));
            result += prev;
            let start = left.indexOf("[[") + 2;
            let end = left.indexOf("]]", start);
            let link = left.substring(start, end);
            left = left.substring(end + 2);
            if (prev.indexOf("```") != -1 && left.indexOf("```") != -1)
                result += "[[" + link + "]]";
            else result += "[" + link.trim() + "](/##)";
            last = end + 2;
        }
        result += left;
        return result;
    }

    function renderMdToHtml(response) {
        let result = preprocessImage(response);
        result = preprocessLink(result);
        let converter = new showdown.Converter({
            simpleLineBreaks: true,
            tasklists: true,
            headerLevelStart: 2,
            simplifiedAutoLink: true,
            strikethrough: true,
            emoji: true,
        });
        converter.setFlavor("github");
        return converter.makeHtml(result);
    }

    function updatePage(file, content) {
        show_status = true;
        jq.ajax({
            url: "/api/page",
            type: "POST",
            datatype: "json",
            contentType: "Application/json",
            data: JSON.stringify({
                file: file,
                content: content,
            }),
            success: function (response) {
                show_status = false;
                localStorage.setItem("page-content", content);
                localStorage.setItem("file", file);
                jq("#page-content").html(renderMdToHtml(content));
                setPageDefault();
            },
            error: function (err) {
                show_status = false;
                console.log(err);
                return err;
            },
        });
    }

    function isDailyQueryType(query_type) {
        return query_type === "daily_prev" || query_type === "daily_next";
    };

    function fetchPage(url, query_type = "") {
        let date = new Date();
        let begin_date = new Date(date.setDate(date.getDate() - 1000));
        show_status = true;
        show_rsslink = false;
        let data = {
            path: url,
            query_type: query_type,
        };
        jq.ajax({
            url: "/api/page",
            data: data,
            type: "GET",
            datatype: "json",
            contentType: "Application/json",
            headers: {
                // Important since warp will cache the unmodified files
                "If-Modified-Since": begin_date.toISOString(),
            },
            statusCode: {
                400: function () {
                    window.location.href = "/obweb";
                },
                500: function () {
                    window.location.href = "/obweb";
                },
            },
            success: function (response) {
                show_status = false;
                file = response[0];
                if (file !== 'NoPage' && isDailyQueryType(query_type)) {
                    let index = file.lastIndexOf('/');
                    // 返回的名称样例: `journals/2023-12-17.md`
                    let date_str = file.substring(index + 1).replace('.md', '');
                    let return_day = dayjs(date_str);
                    if (return_day.isValid) {
                        global_date = return_day.toDate();
                    }
                }
                content = response[1];
                rsslink = response[2];
                publish_time = response[3];
                if (file != "NoPage") {
                    localStorage.setItem("page-content", content);
                    localStorage.setItem("file", file);
                    jq("#fileName").text(file.replace(/.md/g, ""));
                    jq("#fileName").prop("hidden", false);
                    jq("#pageNavBar").prop("hidden", false);
                    let res = query_type == "rss" ? content : renderMdToHtml(content);
                    jq("#page-content").html(res);
                    page_content_hidden = false;
                    // jq("#page-content").prop("hidden", false);
                    if (rsslink != undefined && rsslink != "") {
                        jq("#rsslink").prop("hidden", false);
                        show_rsslink = true;
                        let pos = localStorage.getItem("pos_" + file);
                        pos = pos == null ? 0 : pos;
                        jq("html, body").animate({ scrollTop: pos }, "fast");
                    }
                    setPageDefault();
                } else {
                    jq("#page-content").html("<h3>No Page</h3>");
                    jq("#fileName").text(url);
                }
            },
            error: function (err) {
                show_status = false;
                return err;
            },
        });
    }

    function isValidHttpUrl(string) {
        let url;

        try {
            url = new URL(string);
        } catch (_) {
            return false;
        }
        return url.protocol === "http:" || url.protocol === "https:";
    }

    function hookInit() {
        jq(".pageContent")
            .off("click")
            .on("click", "a", function (e) {
                e.preventDefault();
                let text = e.target.innerText;
                let url = e.target.href;
                if (!url) { return false; }
                //console.log(e.target);
                console.log(e.target);
                let internal_link = e.target.getAttribute("id");
                console.log(internal_link);
                if (internal_link != null) {
                    if (url.indexOf("##") != -1) {
                        search_input = internal_link;
                        if (cur_page == "find") search();
                        else cur_page = "find";
                    } else if (url.indexOf("#") != -1) {
                        let type = cur_page == "rss" ? "rss" : "md";
                        fetchPage(internal_link, type);
                    }
                } else {
                    console.log("open ....");
                    window.open(url, "_blank");
                }
            });

        jq("#searchInput").on("keyup", function (event) {
            if (event.keyCode == 13) {
                search();
            }
        });

        window.onscroll = function () {
            localStorage.setItem("pos_" + file, window.pageYOffset);
        };
    }

    function setPageDefault() {
        jq("#page-content").prop("contenteditable", false);
        jq("#backBtn").prop("hidden", false);
        jq("#markBtn").prop("hidden", true);
        jq("#page-content").css("backgroundColor", "white");
        jq("#editBtn").text("Edit");
        if (cur_page != "rss") hljs.highlightAll();
        if (cur_page == "day") {
            jq("img").css("width", "70%");
            jq("img").css("height", "70%");
        }
        adjustTodo();
        hookInit();
        in_edit = false;
        if (search_input != "" && cur_page == "find") {
            highlight(search_input);
        }
    }

    function savePage() {
        let text = document
            .getElementById("page-content")
            .innerText.replace(/\u00a0/g, " ");
        let prev_content = localStorage.getItem("page-content");
        if (prev_content != text) {
            updatePage(localStorage.getItem("file"), text);
        } else {
            jq("#page-content").html(renderMdToHtml(prev_content));
            setPageDefault();
        }
    }

    function editPage() {
        if (in_edit) {
            savePage();
        } else {
            let content = document.getElementById("page-content");
            content.innerText = localStorage
                .getItem("page-content")
                .replace(/ /g, "\u00a0");
            jq("#page-content").prop("contenteditable", true);
            jq("#page-content").css("backgroundColor", "#fffcc0");
            jq("#editBtn").text("Save");
            in_edit = true;
        }
    }

    function search() {
        show_status = true;
        show_rsslink = false;
        jq.ajax({
            url: "/api/search?keyword=" + search_input,
            type: "GET",
            datatype: "json",
            contentType: "Application/json",
            statusCode: {
                400: function () {
                    window.location.href = "/obweb";
                },
                500: function () {
                    window.location.href = "/obweb";
                },
            },
            success: function (response) {
                show_status = false;
                if (response != "no-page") {
                    jq("#page-content").html(renderMdToHtml(response));
                    page_content_hidden = false;
                    // jq("#page-content").prop("hidden", false);
                    jq("#fileName").prop("hidden", true);
                    jq("#pageNavBar").prop("hidden", true);
                    setPageDefault();
                } else {
                    jq("#page-content").html(
                        "<h3>No Page</h3>" + " " + local_date
                    );
                }
            },
            error: function (err) {
                show_status = false;
                return err;
            },
        });
    }

    function markRead() {
        show_status = true;
        jq.ajax({
            url: "/api/rss_mark?index=0",
            type: "POST",
            data: "",
            datatype: "json",
            contentType: "Application/json",
            statusCode: {
                400: function () {
                    window.location.href = "/obweb";
                },
                500: function () {
                    window.location.href = "/obweb";
                },
            },
            success: function (response) {
                show_status = false;
                if (response == "ok") {
                    jq("#markBtn").prop("hidden", false);
                    fetchRss();
                }
            },
            error: function (err) {
                show_status = false;
                console.log(err);
                return err;
            },
        });
    }

    function fetchRss() {
        show_status = true;
        show_rsslink = false;
        rss_query_type = localStorage.getItem("rss_query_type") || "unread";
        let data = {
            "query_type": rss_query_type,
            "limit": 100,
        }
        jq.ajax({
            url: "/api/rss",
            type: "GET",
            data: data,
            datatype: "json",
            contentType: "Application/json",
            statusCode: {
                400: function () {
                    window.location.href = "/obweb";
                },
                500: function () {
                    window.location.href = "/obweb";
                },
            },
            success: function (response) {
                show_status = false;
                file = "rss";
                if (response != "no-page") {
                    jq("#page-content").html(renderMdToHtml(response));
                    // jq("#page-content").prop("hidden", false);
                    page_content_hidden = false;
                    jq("#fileName").prop("hidden", true);
                    jq("#backBtn").prop("hidden", true);
                    jq("#markBtn").prop("hidden", false);
                    jq("#pageNavBar").prop("hidden", true);
                    console.log("set setPageDefault....");
                    jq("#rssread").prop("checked", rss_query_type == "all");
                    console.log("set default: ", rss_query_type);

                    let pos = localStorage.getItem("pos_" + file);
                    pos = pos == null ? 0 : pos;
                    jq("html, body").animate({ scrollTop: pos }, "fast");
                } else {
                    jq("#page-content").html(
                        "<h3>No Page</h3>" + " " + local_date
                    );
                }
            },
            error: function (err) {
                show_status = false;
                return err;
            },
        });
    }

    function rssRead() {
        rss_query_type = jq(this).prop('checked') === true ? "all" : "unread";
        localStorage.setItem("rss_query_type", rss_query_type);
        cur_page = "rss";
        console.log("rss read:", rss_query_type);
        fetchRss();
    }

    function highlight(keyword) {
        let markInstance = new Mark(jq("#page-content").get(0));
        let options = {};
        if (keyword != "" && keyword != undefined) {
            markInstance.unmark({
                done: function () {
                    markInstance.mark(keyword, options);
                },
            });
        }
    }

    onMount(async () => {
        setPageDefault();
    });
</script>

<div class="tab-content">
    {#if cur_page == "day"}
        <div class="row sticky-top" style="margin-top: 20px; border: 0;">
            <div class="col-md-2" />
            <div class="col-md-8 text-right" style="margin-top: 5px">
                <button
                    type="button"
                    class="btn btn-info"
                    style="float: left"
                    on:click={prevDaily}>Prev</button
                >
                <button
                    type="button"
                    class="btn btn-warning"
                    style="float: center"
                    id="editBtn"
                    on:click={editPage}>Edit</button>
                <button type="button" class="btn btn-info" on:click={nextDaily}
                    >Next</button
                >
            </div>
        </div>
    {:else if cur_page == "rand" || cur_page == "todo"}
        <div class="row sticky-top" style="margin-top: 20px; border: 0;">
            <div class="col-md-2" />
            <div class="col-md-8 text-right" style="margin-top: 5px">
                <button
                    type="button"
                    class="btn btn-warning"
                    style="float: center"
                    id="editBtn"
                    on:click={editPage}>Edit</button>
            </div>
        </div>
    {:else if cur_page == "rss"}
        <div class="row sticky-top" style="margin-top: 20px; border: 0;">
            <div class="col-md-2" />
            <div class="col-md-8 text-right" style="margin-top: 5px" id="pageNavBarRss">
                    <button
                    type="button"
                    class="btn btn-info"
                    style="float: left"
                    id="backBtn"
                    hidden="true"
                    on:click={fetchRss}>Back</button>

                    {#if !show_rsslink}
                        <button
                        type="button"
                        class="btn btn-info"
                        style="float: left"
                        id="markBtn"
                        hidden="true"
                        on:click={markRead}>Mark</button>

                        <label class="switch" style="float: right">
                            <input id="rssread" type="checkbox" on:click={rssRead} >
                            <span class="slider round"></span>
                        </label>
                    {/if}

            </div>
        </div>

    {:else if cur_page == "find"}
        <div class="row">
            <div class="col-md-2" />
            <div class="col-md-8">
                <div class="input-group" style="margin-top: 30px">
                    <input
                        type="text"
                        bind:value={search_input}
                        class="form-control"
                        placeholder="search ..."
                        id="searchInput"/>
                    <div class="input-group-append">
                        <button
                            class="btn btn-secondary"
                            type="button"
                            id="searchBtn"
                            style="margin-left: 5px"
                            on:click={search}>
                            <i class="fa fa-search" />
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <div class="row sticky-top" style="margin-top: 20px; border: 0;">
            <div class="col-md-2" />
            <div class="col-md-8 text-right" hidden="true" style="margin-top: 5px" id="pageNavBar">
                <button
                    type="button"
                    class="btn btn-info"
                    style="float: left"
                    id="backBtn"
                    on:click={search}>Back</button
                >
                <button
                    type="button"
                    class="btn btn-warning"
                    id="editBtn"
                    on:click={editPage}>Edit</button
                >
            </div>
        </div>
    {/if}

    {#if show_status}
        <div class="row">
            <div class="col-md-2" />
            <div class="col-md-8" id="status-sp" style="margin-top: 20px;">
                <div class="text-center">
                    <div class="spinner-border text-success" role="status">
                        <span class="sr-only" />
                    </div>
                </div>
            </div>
        </div>
    {/if}

    <div class="row">
        <div class="col-md-2" />
        <div class="col-md-8">
            <div class="text-center" style="margin-top: 20px;">
                <h4>
                    <span
                        class="badge badge-secondary"
                        style="white-space: pre-line;"
                        hidden="true"
                        id="fileName"
                    />
                </h4>
            </div>
        </div>
        <div class="col-md-2" />
    </div>

    {#if show_rsslink}
        <div class="row">
            <div class="col-md-2" />
            <div class="col-md-8">
                <a href={rsslink} id="rsslink" target="_blank">{publish_time.split(" ")[0]} 👻 {new URL(rsslink).origin} </a
                >
            </div>
        </div>
    {/if}

    <div class="row">
        <div class="col-md-2" />
        <div class="col-md-8">
            <div class="pageContent" hidden="{page_content_hidden}" id="page-content" />
        </div>
    </div>
</div>
