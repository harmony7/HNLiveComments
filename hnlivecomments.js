(function(window) {

    // -- Utility functions --

    // Convert a time span string (useful only on Hacker News!)
    var readTimeSpan = function(str) {
        // split time span string into number and unit
        var number = 0;
        if (str != null) {
            number = parseInt(str.toLowerCase().trim(), 10);
            if (str.indexOf("minute") >= 0) {
                number = number * 1000 * 60;
            } else if (str.indexOf("hour") >= 0) {
                number = number * 1000 * 60 * 60;
            } else if (str.indexOf("day") >= 0) {
                number = number * 1000 * 60 * 60 * 24;
            }
        }
        return new Date(new Date().getTime() - number);
    };

    // Convert a number of milliseconds into time span string (Hacker News style)
    var formatTimeSpan = function(ticks) {
        var minutes = Math.floor(ticks / (60 * 1000));
        if(minutes < 60) {
            if (minutes < 1) {
                minutes = 1;
            }
            return minutes + " minute" + (minutes != 1 ? "s" : "") + " ago";
        }
        var hours = Math.floor(minutes / 60);
        if(hours < 24) {
            return hours + " hour" + (hours != 1 ? "s" : "") + " ago";
        }
        var days = Math.floor(hours / 24);
        return days + " day" + (days != 1 ? "s" : "") + " ago";
    };

    // Load a script file, and then call the next callback function
    var loadScriptWithCallback = function (url, callback) {
        var script = document.createElement('script');
        script.async = true;
        script.src = url;
        var entry = document.getElementsByTagName('script')[0];
        entry.parentNode.insertBefore(script, entry);
        if (script.addEventListener) {
            script.addEventListener('load', function() {
                callback();
            }, false);
        } else {
            var readyHandler = function () {
                if (/complete|loaded/.test(script.readyState)) {
                    callback();
                    script.detachEvent('onreadystatechange', readyHandler);
                }
            };
            script.attachEvent('onreadystatechange', readyHandler);
        }
    };

    // Load any number of scripts sequentially and then call the
    // next callback function
    var loadScriptsWithCallback = function(scripts, callback) {
        // Make a local clone of scripts array.
        if (scripts.length == 0) {
            callback();
        } else {
            var list = scripts.slice(0);
            var script = list.shift();
            loadScriptWithCallback(script, function() {
                loadScriptsWithCallback(list, callback);
            });
        }
    };

    // Returns a boolean value indicating whether one string
    // begins with the characters of another string.
    var stringBeginsWith = function(str, compare) {
        var length = compare.length;
        return str.substring(0, length) == compare;
    };

    // Begin

    var currentPageHref = location.href;

    if (!stringBeginsWith(currentPageHref, "https://news.ycombinator.com/item?id=")) {
        alert("This bookmarklet should be invoked only on individual article pages on Hacker News.");
        return;
    }

    if (window["E608C736-2041-47A9-A2A5-591114F4123B"]) {
        console.log("Double-loading prevented.");
        return;
    }
    window["E608C736-2041-47A9-A2A5-591114F4123B"] = true;

    var appRoot = window['AC37E99A-3A9A-44EF-A901-20285DEB1ECE'];

    // Ugly nested JavaScript loading, but after we get all this out of the way we can call our main method below.
    loadScriptWithCallback("http://code.jquery.com/jquery-1.10.1.min.js", function() {
        var $ = jQuery.noConflict(true);
        loadScriptsWithCallback([
            appRoot + "knockout-3.0.0.js",
            appRoot + "json2.js",
            appRoot + "pollymer.js"
        ], function() {
            main($, ko, Pollymer);
        });
    });

    // This is finally called at the end of the chain of loading various JavaScript files
    var main = function($, ko, Pollymer) {

        var testButtonsHtml =
            "<div data-bind=\"visible: debugMode\">" +
                "<button data-bind=\"text: realtime() ? 'Realtime: ON' : 'Realtime: OFF', click: switchRealtime\"></button>" +
                "<button data-bind=\"click: refresh\">Refresh comments</button>" +
                "<button>Add Test Item (Top)</button>" +
                "<button>Add Test Item (Random)</button>" +
            "</div>";

        $(document.body).append(testButtonsHtml);

        var styleSheet =
            "<style>" +
                ".comment-item {" +
                "-moz-transition: height 1s, opacity 1s; -webkit-transition: height 1s, opacity 1s; transition: height 1s, opacity 1s;" +
                "}" +
                ".comment-item.added {" +
                "height: 0;" +
                "}" +
            "</style>";

        var template =
            "<script type=\"text/html\" id=\"comment-template\">" +
                "<!-- ko foreach: {data: comments, afterAdd: slideInCommentItems } -->" +
                "<tr><td>" +
                "<table class=\"comment-item\" border=\"0\"><tbody><tr>"+
                "<td>" +
                "<img src=\"s.gif\" height=\"1\" data-bind=\"attr: { width: indent * 40 }\"></td>" +
                "<td valign=\"top\"><center>" +
                "<a data-bind=\"attr: { id: 'up_' + id, href: 'vote?for=' + id + '&amp;dir=up' }\"><div class=\"votearrow\" title=\"upvote\"></div></a>" +
                "<span data-bind=\"attr: { id: 'down_' + id }\"></span></center></td>" +
                "<td class=\"default\"><div style=\"margin-top:2px; margin-bottom:-10px; \"><span class=\"comhead\">" +
                "<a data-bind=\"text: user, attr: { href: 'user?id=' + user }\"></a> <span data-bind=\"text: ago\"></span> | " +
                "<a data-bind=\"attr: { href: 'item?id=' + id }\">link</a></span></div>" +
                "<br><span class=\"comment\" data-bind=\"html: comment\"></span>" +
                "<p><font size=\"1\"><u><a data-bind=\"attr: { href: 'reply?id=' + id }\">reply</a></u></font></p>" +
                "</td>" +
                "</tr></tbody></table>" +
                "</td></tr>" +
                "<!-- /ko -->" +
                "</script>";

        $(document.body).append(styleSheet);
        $(document.body).append(template);

        var now = ko.observable(new Date());

        var buildEntry = function(id, parentId, user, comment, time) {
            var obj = {
                id: id,
                parentId: parentId,
                user: user,
                comment: comment,
                time: ko.observable(time),
                indent: 0
            };
            obj.ago = ko.computed(function() {
                return formatTimeSpan(now().getTime() - this.time().getTime());
            }, obj);
            return obj;
        };

        var scrapeRow = function(tableElement) {
            var id = 0;
            $(tableElement).find("a").each(function(i, element) {
                var href = $(element).attr("href");
                if (href.substring(0, 8) == "item?id=") {
                    id = href.substring(8);
                    return false;
                }
            });

            var user = "";
            $(tableElement).find("a").each(function(i, element) {
                var href = $(element).attr("href");
                if (href.substring(0, 8) == "user?id=") {
                    user = href.substring(8);
                    return false;
                }
            });

            var dateElements = $(tableElement).find(".comhead").contents().filter(function() {
                return this.nodeType == 3;
            }).map(function() {
                return this.textContent;
            });

            var dateString = dateElements.length >= 1 ? dateElements[0] : "1 minute";

            // Because of the messy HTML given to us by HackerNews,
            // we get a bunch of unclosed <p> tags.  For this reason we
            // have to move stuff around a bit.
            var replyLink = $(tableElement).find("td.default a:last");
            var theParagraph = replyLink.closest("p");
            $(tableElement).find("td.default").append(theParagraph);

            var comment = $(tableElement).find("span.comment").html();

            var time = readTimeSpan(dateString);
            return buildEntry(id, 0, user, comment, time);
        };

        var scrapeTables = function(outerTable) {
            // Find the containing table by looking for s.gif on the page.
            var spacerImages = outerTable.find("img[src='s.gif']").slice(1, -1);

            var items = [];

            $.each(spacerImages, function(i, element) {
                var spacer = $(element);
                var indent = parseInt(spacer.attr("width")) / 40; // Each item is indented by 40 px
                var articleTable = $(element).closest("table");

                var entry = scrapeRow(articleTable);
                entry.indent = indent;
                items.push(entry);
            });

            return items;
        };

        var frameworkTables = $("body > center > table > tbody > tr:nth-child(3) > td > table");

        var comments;
        var outerTable;
        if (frameworkTables.length > 1) {
            outerTable = $(frameworkTables[1]);
            comments = scrapeTables(outerTable);
        } else {
            var td = $(frameworkTables[0]).closest("td");
            var outerTable = $("<table border=\"0\"></table>");
            td.append(outerTable);
            td.append("<br><br>")
            comments = [];
        }

        outerTable.find("tbody").remove();
        var tBody = $("<tbody>");
        tBody.attr("data-bind", "template: { name: 'comment-template' }");
        outerTable.append(tBody);

        var id = 0;
        $(frameworkTables[0]).find("a").each(function(i, element) {
            var href = $(element).attr("href");
            if (href.substring(0, 8) == "item?id=") {
                id = href.substring(8);
                return false;
            }
        });

        var ViewModel = function(id, comments) {
            this.id = id;
            this.comments = ko.observableArray(comments);
            this.slideInCommentItems = function(elem) {
                if (elem.nodeType == 1) {
                    var height = elem.clientHeight;
                    $(elem).data("fullPixelHeight", height);
                    elem.className += " added";
                }
            };
            var refreshHolder = null;
            this.insertItems = function(needRefresh, items) {
                if (needRefresh) {
                    refreshHolder = $("<div>");
                    refreshHolder.load("/item?id=" + id + " table:first", function() {
                        // $(document.body).append(refreshHolder);
                        var frameworkTables = refreshHolder.find("table > tbody > tr:nth-child(3) > td > table");
                        console.log(refreshHolder);
                    });
                }

                var viewModel = this;
                $.each(items, function() {
                    var item = this;
                    var index = 0;
                    $.each(viewModel.comments(), function(i) {
                        if (this.id == item.parentId) {
                            index = i + 1;
                            item.indent = this.indent + 1;
                            return false;
                        }
                    });
                    viewModel.comments.splice(index, 0, item);
                });
            };

            this.realtime = ko.observable(false);
            this.debugMode = ko.observable(false);

            this.switchRealtime = function() {
                this.realtime(!this.realtime());
            };

            this.refresh = function() {
                // This is juicy.  What we have to do is
                // use ajax to get a new copy of the current page, and
                // then scrape that.

            };
        };

        var viewModel = new ViewModel(id, comments);

        ko.applyBindings(viewModel);

        var lastCursor = null;
        var req = new Pollymer.Request();
        req.on('finished', function(code, result) {
            if (code == 404) {
                // If 404, then we have a bad last cursor.  We clear the last cursor
                // and start again as though this were the first call.
                lastCursor = null;
                req.retry();
                return;
            }
            var needRefresh = lastCursor == null;
            lastCursor = result.last_cursor;

            var comments = $.map(result.items, function(item) {
                return buildEntry(
                    item['article-id'],
                    item['parent-id'],
                    item['author'],
                    item['body'],
                    readTimeSpan(item['date-string'])
                );
            });

            viewModel.insertItems(needRefresh, comments);

            now(new Date());
        });
        req.maxTries = -1;
        req.recurring = true;

        // Bind a handler to when we start or stop realtime
        viewModel.realtime.subscribe(function(value) {
            if (value) {
                // Switching on realtime
                req.start('GET', function() {
                    var baseUri = 'http://api.hnstream.com';
                    return baseUri + '/news/' + id + '/comments/items/?since=cursor%3A' + (lastCursor != null ? lastCursor : "");
                });
            } else {
                // Switching off realtime
                req.abort();
            }
        });

        // Set realtime on
        viewModel.realtime(true);

        window["hnlivecomments-enable-debug"] = function() {
            viewModel.debugMode(true);
            window.ext$ = $;
        };
        window["hnlivecomments-disable-debug"] = function() {
            viewModel.debugMode(false);
            delete window.ext$;
        };
    };

})(window);