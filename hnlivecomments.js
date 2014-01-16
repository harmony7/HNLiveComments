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

    // Load a script file and move the specified variables from the global
    // scope to a property on a context object, then call the specified
    // callback method and pass the context object to it.
    var loadScriptAndAddToContext = function(script, varNames, callback) {
        var ctx = {};
        var tmpCtx = {};
        for(var i = 0; i < varNames.length; i++) {
            var varName = varNames[i];
            if(varName in window) {
                tmpCtx[varName] = window[varName];
            }
        }
        loadScriptWithCallback(script, function() {
            for(var i = 0; i < varNames.length; i++) {
                var varName = varNames[i];
                if (varName in window) {
                    ctx[varName] = window[varName];
                }
                if(varName in tmpCtx) {
                    window[varName] = tmpCtx[varName];
                } else {
                    delete window[varName];
                }
            }
            callback(ctx);
        });
    };

    // Load a series of script files, extracting the specified variables from
    // the global scope after each file is loaded, and then call the specified
    // callback method passing in a context object that contains the extracted
    // variables as properties.
    var loadScriptsAndAddToContext = function(scriptAndVarNames, callback) {
        var ctx = {};
        var worker = function(ctx, scriptAndVarNames, callback) {
            if (scriptAndVarNames.length == 0) {
                callback(ctx);
            } else {
                var list = scriptAndVarNames.slice(0);
                var scriptAndVars = list.shift();
                var script = scriptAndVars.shift();
                loadScriptAndAddToContext(script, scriptAndVars, function(context) {
                    for (prop in context) {
                        if (context.hasOwnProperty(prop)) {
                            ctx[prop] = context[prop];
                        }
                    }
                    worker(ctx, list, callback);
                });
            }
        };
        return worker(ctx, scriptAndVarNames, callback);
    };

    // Return a boolean value indicating whether one string
    // begins with the characters of another string.
    var stringBeginsWith = function(str, compare) {
        var length = compare.length;
        return str.substring(0, length) == compare;
    };

    // Pre-startup tasks

    if (!stringBeginsWith(location.href, "https://news.ycombinator.com/item?id=")) {
        alert("This bookmarklet should be invoked only on individual article pages on Hacker News.");
        return;
    }

    if (window["E608C736-2041-47A9-A2A5-591114F4123B"]) {
        console.log("Double-loading prevented.");
        return;
    }
    window["E608C736-2041-47A9-A2A5-591114F4123B"] = true;

    var appRoot = window['AC37E99A-3A9A-44EF-A901-20285DEB1ECE'];

    // Load various JavaScript files, and then jump to our main method below.
    loadScriptsAndAddToContext([
        [appRoot + "json2.js"],
        ["http://code.jquery.com/jquery-1.10.1.min.js", "$"],
        [appRoot + "knockout-3.0.0.js", "ko"],
        [appRoot + "pollymer.js", "Pollymer"]
    ], function(ctx) {
        main(ctx.$, ctx.ko, ctx.Pollymer);
    });

    // Main entry point
    var main = function($, ko, Pollymer) {

        var hnLiveCommentsInfoBar = $(
            "<div class=\"hnLiveCommentsInfoBar\">" +
                "<table width=\"85%\"><tr><td>" +
                "Hacker News Live Comments Bookmarklet" +
                "</td><td style=\"text-align:right\">" +
                "<button data-bind=\"text: realtime() ? 'Realtime: ON' : 'Realtime: OFF', click: switchRealtime\"></button>" +
                "<button data-bind=\"click: refresh\">Refresh comments</button>" +
                "<button data-bind=\"visible: debugMode, click: addTestTop\">Add Test Item (Top)</button>" +
                "<button data-bind=\"visible: debugMode, click: addTestRandom\">Add Test Item (Random)</button>" +
                "</td></tr></table>" +
            "</div>"
        );

        $(document.body).append(hnLiveCommentsInfoBar);

        var styleSheet =
            "<style>" +
                ".comment-item {" +
                "-moz-transition: height 1s, opacity 1s; -webkit-transition: height 1s, opacity 1s; transition: height 1s, opacity 1s;" +
                "}" +
                ".comment-item.added {" +
                "height: 0;" +
                "}" +
                ".hnLiveCommentsInfoBar {" +
                "background-color: #54B0DF;" +
                "position: fixed;" +
                "top: 0;" +
                "left: 0;" +
                "width: 100%;" +
                "}" +
                ".hnLiveCommentsInfoBar > table {" +
                "margin: auto;" +
                "}" +
                ".hnLiveCommentsInfoBar > table > tbody > tr > td {" +
                "color: black;" +
                "padding: 2px 8px;" +
                "font: bold 10pt Verdana;" +
                "}" +
            "</style>";

        $(document.body).append(styleSheet);

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

        var scrapeTables = function(scope) {
            // Find the containing table by looking for s.gif on the page.
            var spacerImages = scope.find("img[src='s.gif']").slice(1, -1);

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

        var outerTable;
        if (frameworkTables.length > 1) {
            outerTable = $(frameworkTables[1]);
        } else {
            var td = $(frameworkTables[0]).closest("td");
            var outerTable = $("<table border=\"0\"></table>");
            td.append(outerTable);
            td.append("<br><br>")
        }

        $(
            "<table><tbody>" +
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
                "<tr data-bind=\"visible: isRefreshing\"><td>" +
                "<div style=\"padding: 4px 30px;\"><img src=\"" + appRoot + "ajax-loader.gif\" /> Refreshing Comments...</div>" +
                "</td></tr>" +
                "<tr data-bind=\"visible: initializing\"><td>" +
                "<div style=\"padding: 4px 30px;\"><img src=\"" + appRoot + "ajax-loader.gif\" /> Initializing...</div>" +
                "</td></tr>" +
            "</tbody></table>"
        ).insertAfter(outerTable);

        outerTable.remove();

        var numCommentsNode = null;

        $(frameworkTables[0]).find("a").each(function(i, element) {
            var href = $(element).attr("href");
            if (href.substring(0, 8) == "item?id=") {
                numCommentsNode = $(element);
                return false;
            }
        });

        var id = numCommentsNode != null ? numCommentsNode.attr("href").substring(8) : null;
        numCommentsNode.attr("data-bind", "text: numCommentsString");

        var ViewModel = function(id) {
            this.initializing = ko.observable(true);
            this.id = id;
            this.comments = ko.observableArray();
            this.slideInCommentItems = function(elem) {
                if (elem.nodeType == 1) {
                    var height = elem.clientHeight;
                    $(elem).data("fullPixelHeight", height);
                    elem.className += " added";
                }
            };
            var refreshHolder = ko.observable(null);
            this.isRefreshing = ko.computed(function() {
                return refreshHolder() != null;
            });
            this.isEmpty = ko.computed(function() {
                return this.comments().length == 0 && refreshHolder() == null;
            }, this);
            var queue = [];
            this.addQueuedItems = function() {
                if (refreshHolder() == null) {
                    var viewModel = this;
                    $.each(queue, function() {
                        var item = this;
                        var index = 0;
                        var skip = false;
                        $.each(viewModel.comments(), function(i) {
                            // Skip item if already in comments
                            if (this.id == item.id) {
                                skip = true;
                                return false;
                            }
                            // Move to appropriate position and indentation
                            // if we found the parent.
                            if (this.id == item.parentId) {
                                index = i + 1;
                                item.indent = this.indent + 1;
                            }
                        });
                        if (!skip) {
                            viewModel.comments.splice(index, 0, item);
                        }
                    });
                    queue = [];
                }
            };
            this.insertItems = function(needRefresh, items) {
                this.initializing(false);
                if (needRefresh) {
                    var viewModel = this;
                    this.comments.removeAll();
                    refreshHolder($("<div>"));
                    refreshHolder().load("/item?id=" + id + " table:first", function() {
                        var comments = scrapeTables(refreshHolder());
                        $.each(comments, function() {
                            viewModel.comments.push(this);
                        });
                        refreshHolder(null);
                        viewModel.addQueuedItems();
                    });
                }
                // Enqueue each item
                $.each(items, function() {
                    queue.push(this);
                });
                this.addQueuedItems();
            };

            this.realtime = ko.observable(false);
            this.debugMode = ko.observable(false);

            this.switchRealtime = function() {
                this.realtime(!this.realtime());
            };

            this.refresh = function() {
                lastCursor = null;
                this.realtime(false);
                this.realtime(true);
            };

            this.numCommentsString = ko.computed(function() {
                if (this.initializing()) {
                    return "Initializing...";
                }
                if (this.isRefreshing()) {
                    return "Refreshing...";
                }
                return this.comments().length + ' comments';
            }, this);

            this.addTestEntry = function(fn) {
                var entry = buildEntry(
                    new Date().getTime(),
                    0,
                    "test-author",
                    "<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus ut egestas tortor. " +
                    "Quisque fringilla leo vel quam dictum fringilla. Nullam adipiscing elit eget nulla pharetra aliquam. " +
                    "Proin malesuada volutpat arcu, quis tincidunt neque volutpat at. Nunc dignissim elit at placerat tristique. " +
                    "Nullam quis aliquam justo. Mauris dictum molestie tortor sed tempus. Nulla ut turpis nisl. " +
                    "Maecenas tincidunt, mauris at cursus vulputate, ipsum sapien venenatis sem, vel vulputate mi mauris vel massa.</p>" +

                    "<p>Cras iaculis hendrerit justo eget gravida. Aliquam faucibus felis aliquet felis eleifend, " +
                    "eu aliquam arcu adipiscing. Vestibulum vulputate, magna et eleifend viverra, ante lorem eleifend ligula, " +
                    "sit amet hendrerit diam justo dignissim elit. Vestibulum porttitor, sem eu pellentesque ornare, augue eros " +
                    "consectetur neque, dictum consectetur urna ipsum sit amet sem. Donec vehicula eget urna vitae iaculis. " +
                    "Ut aliquam viverra dolor in accumsan. Morbi eu ultricies mi. Nunc eu tempus velit, a vehicula lorem.</p>" +

                    "<p>Nullam in condimentum urna. Aenean consectetur, augue quis gravida blandit, erat leo auctor leo, eu " +
                    "euismod eros arcu in libero. Aenean vitae ipsum pretium, vestibulum elit et, hendrerit lectus. In malesuada " +
                    "viverra eleifend. Ut vel consectetur nunc, sed sodales ipsum. Mauris sed neque ut nunc blandit aliquam. " +
                    "Curabitur in blandit augue, vel luctus lectus.</p>",

                    new Date()
                );
                if (fn != null) {
                    fn.call(entry);
                }
                this.insertItems(false, [entry]);
            };

            this.addTestTop = function() {
                this.addTestEntry();
            };

            this.addTestRandom = function() {
                var viewModel = this;
                this.addTestEntry(function() {
                    var comments = viewModel.comments();
                    if (comments.length > 0) {
                        var randomIndex = Math.floor(Math.random() * comments.length);
                        var randomComment = comments[randomIndex];
                        this.parentId = randomComment.id;
                    }
                });
            };
        };

        var viewModel = new ViewModel(id);

        ko.applyBindings(viewModel);

        // Move top down just a bit to allow room for info bar
        $(document.body)
            .css("padding-top", hnLiveCommentsInfoBar.height() + "px");

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
                    item['id'],
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
                    var baseUri = '//api.hnstream.com';
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