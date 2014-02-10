(function(window, undefined) {

    // Loader utility methods

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

    // Misc utility methods
    // Return a boolean value indicating whether one string
    // begins with the characters of another string.
    var stringBeginsWith = function(str, compare) {
        var length = compare.length;
        return str.substring(0, length) == compare;
    };

    var cleanUp = function() {
        // Remove 'preparing' cover
        var cover = window.document.getElementById("hn-cover");
        if (cover) {
            cover.parentNode.removeChild(cover);
        }
    };

    var fatalError = function(message) {
        window['FF7BA78F-E740-4C15-BB74-53B6B4E7308F'] = message;
        window.alert(message);
    };

    // Pre-startup tasks

    if (!stringBeginsWith(location.href, "https://news.ycombinator.com/item?id=")) {
        cleanUp();
        fatalError("This bookmarklet can be started only on an individual article page on Hacker News.");
        return;
    }

    if (window["E608C736-2041-47A9-A2A5-591114F4123B"]) {
        cleanUp();
        fatalError("This bookmarklet can be started only once on each page.")
        return;
    }
    window["E608C736-2041-47A9-A2A5-591114F4123B"] = true;

    var appRoot = window['AC37E99A-3A9A-44EF-A901-20285DEB1ECE'];

    var loader = {
        appRoot: appRoot,
        fatalError: fatalError
    };

    // Load various JavaScript files, and then jump to our main method below.
    loadScriptsAndAddToContext([
        [appRoot + "json2.js"],
        [appRoot + "jquery-1.10.2.min.js", "$"],
        [appRoot + "jquery.scrollTo-1.4.3.1-min.js"],
        [appRoot + "knockout-3.0.0.js", "ko"],
        [appRoot + "pollymer-1.0.0.js", "Pollymer"],
        [appRoot + "hnlivecomments-1.0.0.js", "hnlc"]
    ], function(ctx) {
        cleanUp();
        ctx.hnlc.main(loader, ctx.$, ctx.ko, ctx.Pollymer);
    });

})(window);