// Hacker News Live Comments
// v1.0.0   2014-02-10 -- Initial version
// v1.0.1   2014-02-11 -- Support for deleted comments, Better visibility for inserted comments

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

    // Main entry point
    var main = function(loader, $, ko, Pollymer) {

        var hnLiveCommentsInfoBar = $(
            "<div class=\"hnLiveCommentsInfoBar\">" +
                "<table width=\"85%\"><tr><td>" +
                "Hacker News Live Comments Bookmarklet (<a href=\"http://hnlivecomments.pex2.jp/\" target=\"_blank\">About</a>)" +
                "</td><td style=\"text-align:right;height: 28px;\">" +
                "<span data-bind=\"visible: needsInitialScrape\">" +
                    "<button disabled>Preparing...</button>" +
                "</span>" +
                "<span data-bind=\"visible: !needsInitialScrape()\">" +
                    "<span data-bind=\"visible: isRefreshing\"><img src=\"" + loader.appRoot + "ajax-loader-blue.gif\" style=\"vertical-align:text-bottom;\"/></span>" +
                    "<button data-bind=\"text: realtimeButtonLabel, click: switchRealtime, disable: isInitializingRealtime\"></button>" +
                    "<button data-bind=\"text: numUpdatesString, css: {updates: numUpdates() > 0 }, disable: numUpdates() == 0, visible: !isInitializingRealtime(), click: nextUpdate\"></button>" +
                    "<button data-bind=\"visible: debugMode() && !isRefreshing(), click: refresh\">Refresh comments</button>" +
                    "<button data-bind=\"visible: debugMode() && isRefreshing()\" disabled>Refreshing...</button>" +
                    "<button data-bind=\"visible: debugMode, click: addTestTop\">Add Test Item (Top)</button>" +
                    "<button data-bind=\"visible: debugMode, click: addTestRandom\">Add Test Item (Random)</button>" +
                "</span>" +
                "</td></tr></table>" +
            "</div>"
        );

        $(document.body).append(hnLiveCommentsInfoBar);

        var generateTransitions = function(transition) {
            return "-moz-transition: " + transition + ";" +
                "-webkit-transition: " + transition + ";" +
                "transition: " + transition + ";";
        };

        var transitionTime = "1s";
        var bgTransitionTime = "2s";

        var declareAnimations = function(animationName, content) {
            var output = [];
            var prefixes = ["-webkit-", "-moz-", "-o-", ""];
            $.each(prefixes, function(i, element) {
                output.push("@" + element + "keyframes " + animationName + " {");
                output.push(content);
                output.push("}");
            });
            return output.join("");
        };

        var useAnimations = function(animationName, params) {
            var output = [];
            var prefixes = ["-webkit-", "-moz-", "-o-", ""];
            $.each(prefixes, function(i, element) {
                output.push(element + "animation: " + animationName + " " + params + ";");
            });
            return output.join("");
        };

        var styleSheet = $(
            "<style>" +
                declareAnimations("button-pulsate", "0% {background-color: #3399cc;} 100% {background-color: #9933cc;}") +
                "body {" +
                generateTransitions("padding-top " + transitionTime) +
                "}" +
                ".default p:first-child {" +
                "margin-top:0;" +
                "}" +
                "tr.hn-hidden-row {" +
                "display: none;" +
                "}" +
                "tr.hn-ready-row {" +
                "border-spacing: 0;" +
                "}" +
                ".hn-comment-holder {" +
                generateTransitions("height " + transitionTime + ", background-color " + bgTransitionTime) +
                "}" +
                ".hn-comment-holder.animating {" +
                "overflow:hidden;" +
                "}" +
                ".hn-comment-holder .hidden-vote-arrow {" +
                "visibility: hidden;" +
                "}" +
                ".hnLiveCommentsInfoBar {" +
                "background-color: #54B0DF;" +
                "position: fixed;" +
                "overflow: hidden;" +
                "top: 0;" +
                "left: 0;" +
                "width: 100%;" +
                "}" +
                ".hnLiveCommentsInfoBar.hidden {" +
                "height: 0;" +
                generateTransitions("height " + transitionTime) +
                "}" +
                ".hnLiveCommentsInfoBar a {" +
                "color: blue;" +
                "font-weight: normal;" +
                "}" +
                ".hnLiveCommentsInfoBar > table {" +
                "margin: auto;" +
                "}" +
                ".hnLiveCommentsInfoBar > table > tbody > tr > td {" +
                "color: black;" +
                "padding: 2px 8px;" +
                "font: bold 10pt Verdana;" +
                "}" +
                ".hnLiveCommentsInfoBar button {" +
                "border: none;" +
                "background-color: #3399cc;" +
                "padding: 4px;" +
                "cursor: pointer;" +
                "}" +
                ".hnLiveCommentsInfoBar button.updates {" +
                useAnimations("button-pulsate", "alternate 1s infinite") +
                "color: white;" +
                "}" +
                ".hnLiveCommentsInfoBar button:disabled {" +
                "background-color: #ccc;" +
                "cursor: default;" +
                "}" +
            "</style>"
        );

        $(document.body).append(styleSheet);

        var now = ko.observable(new Date());

        var scrapePostId = function(node) {
            return node != null ? node.attr("href").substring(8) : null;
        };

        var buildEntry = function(id, parentId, user, comment, time, upVoteLink) {
            var obj = {
                id: id,
                parentId: parentId,
                user: user,
                comment: comment,
                time: ko.observable(time),
                upVoteLink: ko.observable(upVoteLink),
                score: "",
                selfComment: false,
                indent: 0
            };
            obj.upVoteHref = ko.computed(function() {
                var upVoteLink = this.upVoteLink();
                return upVoteLink != null ? this.upVoteLink() : "#";
            }, obj);
            obj.ago = ko.computed(function() {
                return formatTimeSpan(now().getTime() - this.time().getTime());
            }, obj);
            return obj;
        };

        var scrapeRow = function(tableElement) {
            var upVoteElement = $(tableElement).find("a[id^='up_']").first();
            var upVoteLink = upVoteElement.length > 0 ? upVoteElement.attr("href") : null;

            var idElement = $(tableElement).find("a[href^='item?id=']").first();
            var id = idElement.length > 0 ? parseInt(idElement.attr("href").substring(8)) : 0;

            var userElement = $(tableElement).find("a[href^='user?id=']").first();
            var user = userElement.length > 0 ? userElement.attr("href").substring(8) : "";

            var scoreElement = $(tableElement).find("span[id^='score_']").first();
            var score = scoreElement.length > 0 ? parseInt(scoreElement.text(), 10) : 0;
            var selfComment = scoreElement.length > 0;

            var dateElements = $(tableElement).find(".comhead").contents().filter(function() {
                return this.nodeType == 3;
            }).map(function() {
                return this.textContent;
            });

            // If "self" comment then there is this weird "by" text element that throws this off.
            if (selfComment) {
                dateElements = dateElements.slice(1);
            }

            var dateString = dateElements.length >= 1 ? dateElements[0] : "1 minute";

            // Because of the messy HTML given to us by HackerNews,
            // we get a bunch of unclosed <p> tags.  For this reason we
            // have to move stuff around a bit.

            // This should not be a <span> because it contains <p> tags.  But whatever.
            var commentsSpan = $(tableElement).find("span.comment");

            // In at least Safari and Chrome and IE11,
            // <span><font>abc<p>def<p>ghi</font></span><p><font><u><a>link</a><u></font> is read into the DOM as:
            // <span><font>abc<p>def</p></font><p><font>ghi</font></p><p><font><u><a>link</a><u></font></p></span>

            // First let's move the last <p> (surrounding the link) outside the span (append it to the table)
            var replyLink = $(tableElement).find("td.default a:last");
            var theParagraph = replyLink.closest("p");
            $(tableElement).find("td.default").append(theParagraph);

            // <span><font>abc<p>def</p></font><p><font>ghi</font></p></span>

            // Next, find the first <font>.  See if it contains a <p>.
            // If it does, move it to right after this <font>
            var firstFont = commentsSpan.find("font:first");
            firstFont.find("p").insertAfter(firstFont);

            // <span><font>abc</font><p>def</p><p><font>ghi</font></p></span>

            // Now let's put a <p> tag around the first <font> so that
            // we have a bunch of <p> tags as children of the span.
            firstFont.wrap("<p></p>");

            // <span><p><font>abc</font></p><p>def</p><p><font>ghi</font></p></span>

            // Now we need to take all the font tags and remove them.
            var fontTags = commentsSpan.find("font[color='#000000']");
            fontTags.each(function(i, element) {
                $(element).parent().html($(element).html());
            });

            // Should have:

            // <span><p>abc</p><p>def</p><p>ghi</p></span>

            var comment = commentsSpan.html();

            var time = readTimeSpan(dateString);

            var entry = buildEntry(id, 0, user, comment, time, upVoteLink);
            entry.selfComment = selfComment;
            entry.score = score + " point" + (score != 1 ? "s" : "");

            return entry;
        };

        var scrapeTables = function(scope) {
            // Find the containing table by looking for s.gif on the page.
            var spacerImages = scope.find("img[src='s.gif']");

            var items = [];

            var parentIds = [];

            $.each(spacerImages, function(i, element) {
                var spacer = $(element);
                var width = parseInt(spacer.attr("width"));
                if (width % 40 != 0) {
                    // Self comments and deleted comments have an
                    // extra s.gif whose width is 14.
                    // Filter out such extraneous uses of s.gif
                    return;
                }
                var indent = width / 40; // Each item is indented by 40 px
                var articleTable = $(element).closest("table");

                var entry = scrapeRow(articleTable);
                entry.indent = indent;
                parentIds[indent] = entry.id;
                if (indent > 0) {
                    entry.parentId = parentIds[indent - 1];
                }
                items.push(entry);
            });

            return items;
        };

        var tableWrapper = $("body > center");

        var findTables = function(tableWrapper) {
            var opTable = tableWrapper.find(".title").closest("table");

            var followingTables = opTable.nextAll("table");

            var outerTable;
            if (followingTables.length > 0) {
                outerTable = $(followingTables[0]);
            } else {
                outerTable = $("<table border=\"0\"></table>");
                opTable.parent().append(outerTable);
                opTable.parent().append("<br><br>");
            }

            var postIdNode = opTable.find("td.subtext a[href^='item?id=']").first();

            return {
                outerTable: outerTable,
                postIdNode: postIdNode,
                noreply: opTable.find("[name=fnid]").length == 0
            };
        };

        var tables = findTables(tableWrapper);

        var postIdNode = tables.postIdNode;
        if (postIdNode == null) {
            // For now we don't support subtopic pages.
            hnLiveCommentsInfoBar.remove();
            styleSheet.remove();
            loader.fatalError("This bookmarklet can be started only on individual article pages on Hacker News.\n(Subtopic pages are not supported at this time.)");
            return;
        }

        var id = scrapePostId(postIdNode);
        var initialCount = postIdNode.text();
        postIdNode.attr("data-bind", "text: numCommentsString");

        var noreply = tables.noreply;

        var outerTable = tables.outerTable;

        $(
            "<table><tbody>" +
                "<!-- ko foreach: { data: comments, afterAdd: afterAdd } -->" +
                "<tr><td>" +
                "<div class=\"hn-comment-holder\">" +
                "<table class=\"comment-item\" border=\"0\"><tbody><tr>"+
                "<td>" +
                "<img src=\"s.gif\" height=\"1\" data-bind=\"attr: { width: indent * 40 }\"></td>" +
                "<td valign=\"top\"><center>" +
                "<!-- ko if: selfComment -->" + // If self comment
                "<font color=\"#ff6600\">*</font><br>" +
                "<img src=\"s.gif\" height=\"1\" width=\"14\">" +
                "<!-- /ko -->" +
                "<!-- ko if: !selfComment -->" + // If not self comment
                "<!-- ko if: id != 0 -->" + // If not deleted
                "<a data-bind=\"attr: { id: 'up_' + id, href: upVoteHref }, click: $root.checkVoteLink\"><div class=\"votearrow\" title=\"upvote\"></div></a>" +
                "<span data-bind=\"attr: { id: 'down_' + id }\"></span>" +
                "<!-- /ko -->" +
                "<!-- ko if: id == 0 -->" + // If deleted
                "<img src=\"s.gif\" height=\"1\" width=\"14\">" +
                "<!-- /ko -->" +
                "<!-- /ko -->" +
                "</center></td>" +
                "<td class=\"default\"><div style=\"margin-top:2px; margin-bottom:-10px; \"><span class=\"comhead\">" +
                "<!-- ko if: selfComment -->" + // If self comment
                "<span data-bind=\"attr: { id: 'score_' + id }, text: score\"></span> by " +
                "<!-- /ko -->" +
                "<!-- ko if: id != 0 -->" + // If not deleted
                "<a data-bind=\"text: user, attr: { href: 'user?id=' + user }\"></a> <span data-bind=\"text: ago\"></span> | " +
                "<a data-bind=\"attr: { href: 'item?id=' + id }\">link</a>" +
                "<!-- /ko -->" +
                "</span></div>" +
                "<!-- ko if: id != 0 -->" + // If not deleted
                "<br><span style=\"color: #000000\" class=\"comment\" data-bind=\"html: comment\"></span>" +
                "<!-- ko if: $root.noreply -->" +
                "<p><font size=\"1\"><font color=\"#f6f6ef\">-----</font></font></p>" +
                "<!-- /ko -->" +
                "<!-- ko if: !$root.noreply -->" +
                "<p><font size=\"1\"><u><a data-bind=\"attr: { href: 'reply?id=' + id }\">reply</a></u></font></p>" +
                "<!-- /ko -->" +
                "<!-- /ko -->" +
                "<!-- ko if: id == 0 -->" + // If deleted
                "<span class=\"comment\">[deleted]</span>" +
                "<!-- /ko -->" +
                "</td>" +
                "</tr></tbody></table>" +
                "</div>" +
                "</td></tr>" +
                "<!-- /ko -->" +
            "</tbody></table>"
        ).insertAfter(outerTable);

        var ViewModel = function(id) {
            this.needsInitialScrape = ko.observable(true);
            this.id = id;
            this.comments = ko.observableArray();
            var viewModel = this;
            this.afterAdd = function(elem, i, item) {
                if (elem.nodeType == 1) {
                    var holder = $(elem).find(".hn-comment-holder");
                    item.holder = holder;
                    var height = holder[0].clientHeight;
                    item.fullPixelHeight = height;
                    if(!viewModel.needsInitialScrape()) {
                        holder.closest("tr").addClass("hn-hidden-row");
                        holder.css("height", "0");
                        holder.css("background-color", "#ff6");
                    }
                }
            };
            var refreshHolder = ko.observable(null);
            this.isRefreshing = ko.computed(function() {
                return refreshHolder() != null;
            });
            this.isInitializingRealtime = ko.observable(false);
            this.isEmpty = ko.computed(function() {
                return this.comments().length == 0 && refreshHolder() == null;
            }, this);
            var queue = [];
            var newItemIds = ko.observableArray();
            var castVote = function(target) {
                var href = $(target).attr("href");
                if (href.indexOf("auth") >= 0) {
                    // Logged in, cast vote
                    vote(target);
                } else {
                    // Not logged in, send to link target.
                    window.alert("You must be logged in to cast a vote. You will be taken to a login screen now.");
                    window.location.href = href;
                }
            };
            this.checkVoteLink = function(item, event) {
                var voteLink = item.upVoteLink();
                var target = (event.currentTarget) ? event.currentTarget : event.srcElement;
                if (voteLink != null) {
                    // Go ahead and do the up vote.
                    castVote(target);
                } else {
                    // We don't have a link for this one, so
                    // do a refresh and upgrade the link, then
                    // do the upvote.  But, we should hide the item
                    // now so that there is no duplicate click.
                    $(target).addClass("hidden-vote-arrow");
                    viewModel.insertItems(true, [], function() {
                        var voteLink = item.upVoteLink();
                        if (voteLink == null) {
                            // This is a rare case where probably the item has been deleted.
                            console.log("Item refreshed, but still does not carry link ... item may have been deleted.")
                        } else {
                            castVote(target);
                        }
                    });
                }
            };
            this.addQueuedItems = function() {
                if (refreshHolder() == null) {
                    var viewModel = this;
                    $.each(queue, function() {
                        var item = this;
                        var result = {hasParent: false, index:0, indent: 0, existingItem: null};
                        $.each(viewModel.comments(), function(i) {
                            if (this.id == item.id) {
                                // Skip item if already in comments
                                result.existingItem = this;
                                return false;
                            }
                            if (item.parentId != undefined && this.id == item.parentId) {
                                // Found the parent; remember where appropriate
                                // position and indentation would be
                                result.index = i + 1;
                                result.indent = this.indent + 1;
                                // Mark as parent having been found.
                                result.hasParent = true;
                            }
                        });
                        if (result.existingItem != null) {
                            // Since we found an existing item with the same ID, we will
                            // instead of inserting this item into the list, be
                            // upgrading existing item if incoming data is better

                            var existingItem = result.existingItem;
                            if (!existingItem.upVoteLink() && item.upVoteLink()) {
                                existingItem.upVoteLink(item.upVoteLink());
                            }
                        } else if (item.parentId == undefined || result.hasParent) {
                            // Apply position and indentation only
                            // if item was not already found.
                            item.indent = result.indent;
                            viewModel.comments.splice(result.index, 0, item);
                            newItemIds.push(item);
                        }
                    });
                    queue = [];
                }
            };
            this.insertItems = function(needRefresh, items, next) {
                // Prepare method to call when everything is done.
                var callNext = function() {
                    if (next) {
                        next();
                    }
                };
                if (needRefresh) {
                    var viewModel = this;
                    refreshHolder($("<div>"));
                    refreshHolder().load("/item?id=" + id + " table:first", function() {
                        var tables = findTables(refreshHolder());
                        var outerTable = tables.outerTable;
                        var comments = scrapeTables(outerTable);
                        // We want to add the items in the comments array to the beginning
                        // of the queue array.
                        // To achieve this, we want to reverse the comments array and then
                        // unshift its entries one by one into the queue array.
                        comments.reverse();
                        $.each(comments, function() {
                            queue.unshift(this);
                        });
                        refreshHolder(null);
                        viewModel.addQueuedItems();
                        callNext();
                    });
                }
                // Enqueue each item
                $.each(items, function() {
                    queue.push(this);
                });
                this.addQueuedItems();
                if (!needRefresh) {
                    callNext();
                }
            };

            this.realtime = ko.observable(false);
            this.debugMode = ko.observable(false);

            this.switchRealtime = function() {
                this.realtime(!this.realtime());
            };

            this.realtimeButtonLabel = ko.computed(function() {
                if (this.isInitializingRealtime()) {
                    return "Initializing Updates...";
                }
                return 'Updates: ' + (this.realtime() ? 'ON' : 'OFF');
            }, this);

            this.refresh = function() {
                this.insertItems(true, []);
            };

            this.numCommentsString = ko.computed(function() {
                if (this.needsInitialScrape()) {
                    return initialCount;
                }
                return this.comments().length + ' comments';
            }, this);

            this.numUpdates = ko.computed(function() {
                return newItemIds().length;
            }, this);

            this.numUpdatesString = ko.computed(function() {
                var num = this.numUpdates();
                return num + ' new comment' + (num != 1 ? "s" : "");
            }, this);

            this.nextUpdate = function() {
                var item = newItemIds.shift();
                var holder = item.holder;
                var height = item.fullPixelHeight;
                window.setTimeout(function() {
                    holder.closest("tr").addClass("hn-ready-row").removeClass("hn-hidden-row");
                    holder.addClass("animating");
                    var windowHeight = isNaN(window.innerHeight) ? window.clientHeight : window.innerHeight;
                    $.scrollTo(holder, 800, {
                        offset: -hnLiveCommentsInfoBar.height() - windowHeight / 4,
                        onAfter: function() {
                            holder.css("height", height + "px");
                            holder.css("background-color", "inherit");
                            holder.closest("tr").removeClass("hn-ready-row");
                        }
                    });
                }, 0);
            };

            this.addTestEntry = function(fn) {
                var entry = buildEntry(
                    new Date().getTime(),
                    undefined,
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

                    new Date(),
                    null
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

            this.noreply = noreply;
        };

        // Create view model, passing in the ID and comments
        var viewModel = new ViewModel(id);

        ko.applyBindings(viewModel);

        var height = hnLiveCommentsInfoBar.height();

        hnLiveCommentsInfoBar.addClass("hidden");

        hnLiveCommentsInfoBar
            .css("height", height + "px");

        // Move top down just a bit to allow room for info bar
        $(document.body)
            .css("padding-top", height + "px");

        var lastCursor = null;
        var req = new Pollymer.Request();
        req.on('finished', function(code, result) {
            viewModel.isInitializingRealtime(false);
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
                    readTimeSpan(item['date-string']),
                    null
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
                viewModel.isInitializingRealtime(true);
                // Switching on realtime
                req.start('GET', function() {
                    var baseUri = '//api.hnstream.com';
                    return baseUri + '/news/' + id + '/comments/items/' + (lastCursor != null ? ("?since=cursor%3A" + lastCursor) : "");
                });
            } else {
                // Switching off realtime
                req.abort();
                lastCursor = null;
            }
        });

        // Bind a handler to when the number of unread comments changes
        var originalTitle = document.title;
        viewModel.numUpdates.subscribe(function(value) {
            if (value > 0) {
                document.title = "(" + value + ") " + originalTitle;
            } else {
                document.title = originalTitle;
            }
        });

        // Prepare to start this going.
        // Comments is still empty, but let's get the bar up there.
        window.setTimeout(function() {
            // Once we are running...

            // Perform initial scrape of comments
            var comments = scrapeTables(outerTable);
            outerTable.remove();
            outerTable = null;

            // Set time NOW.
            now(new Date());

            viewModel.comments.valueWillMutate();
            $.each(comments, function() {
                viewModel.comments().push(this);
            });
            viewModel.comments.valueHasMutated();

            // Indicate that we are done scraping
            viewModel.needsInitialScrape(false);

            // Set realtime on
            viewModel.realtime(true);
        }, 0);

        window["hnlivecomments-enable-debug"] = function() {
            viewModel.debugMode(true);
        };
        window["hnlivecomments-disable-debug"] = function() {
            viewModel.debugMode(false);
        };
    };

    window.hnlc = {
        main: main
    };
})(window);