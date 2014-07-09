/*jslint devel:true*/
/*global module, require*/

(function () {

    //'use strict';

    var path = require('path');
    var fs = require('fs');
    var execSync = require("execSync");
    var mkdirp = require('mkdirp');
    var defaults = require('lodash.defaults');

    module.exports = function(params) {

            var target = this.target;

            // Default options
            var options = defaults(params || {}, {
                source: ['logo.png'],
                dest: 'images',
                debug: false,
                trueColor: false,
                precomposed: true,
                HTMLPrefix: "",
                appleTouchBackgroundColor: "auto", // none, auto, #color
                appleTouchPadding: 15,
                windowsTile: true,
                coast: false,
                sharp: 0,
                tileBlackWhite: true,
                tileColor: "auto", // none, auto, #color
                firefox: false,
                apple: true,
                regular: true,
                firefoxRound: false,
                firefoxManifest: "",
                androidHomescreen: false
            });

            // Execute external command
            var execute = function(cmd) {
                if (options.debug) {
                    console.log("\n\033[37m" + cmd + "\033[0m");
                }
                return execSync.exec(cmd);
            };

            // Convert image with imagemagick
            var convert = function(args) {
                args.unshift("convert");
                var ret = execute(args.join(" "));
                if (ret.code === 127) {
                    return console.log('You need to have ImageMagick installed in your PATH for this task to work.');
                }
            };

            // Generate background color for apple touch icons
            var generateColor = function(src) {
                var ret = execute("convert " + src + " -polaroid 180 -resize 1x1 -colors 1 -alpha off -unique-colors txt:- | grep -v ImageMagick | sed -n 's/.*\\(#[0-9A-F]*\\).*/\\1/p'");
                return ret.stdout.trim();
            };

            // Generate background color for windows 8 tile
            var generateTileColor = function(src) {
                var ret = execute("convert " + src + " +dither -colors 1 -alpha off -unique-colors txt:- | grep -v ImageMagick | sed -n 's/.*\\(#[0-9A-F]*\\).*/\\1/p'");
                return ret.stdout.trim();
            };

            var combine = function(src, dest, size, fname, additionalOpts, padding) {
                var out = [
                    src,
                    "-resize",
                    size
                ].concat(additionalOpts);
                if (options.sharp > 0) {
                    out = out.concat([
                        "-adaptive-sharpen",
                        options.sharp + "x" + options.sharp
                    ]);
                }
                // icon padding
                if (typeof(padding)==='number' && padding >= 0 && padding < 100) {
                    var thumb = Math.round((100 - padding) * parseInt(size.split("x")[0], 10) / 100);
                    out = out.concat([
                        "-gravity",
                        "center",
                        "-thumbnail",
                        "\"" + thumb + "x" + thumb + ">" + "\"",
                        "-extent",
                        size
                    ]);
                }
                out.push(path.join(dest, fname));
                return out;
            };



            // Append all icons to HTML as meta tags (needs cheerio)
            var needHTML = options.html !== undefined && options.html !== "";

            if (needHTML) {
                var cheerio = require("cheerio");
                var contents = (fs.existsSync(options.html)) ? fs.read(options.html) : "";
                var $ = cheerio.load(contents);
                // Removing exists favicon from HTML
                $('link[rel="shortcut icon"]').remove();
                $('link[rel="icon"]').remove();
                $('link[rel="apple-touch-icon"]').remove();
                $('link[rel="apple-touch-icon-precomposed"]').remove();
                $('meta').each(function(i, elem) {
                    var name = $(this).attr('name');
                    if(name && (name === 'msapplication-TileImage' ||
                                name === 'msapplication-TileColor' ||
                                name.indexOf('msapplication-square') >= 0)) {
                        $(this).remove();
                    }
                });
                var html = $.html().replace(/(?:(?:^|\n)\s+|\s+(?:$|\n))/g,'').replace(/\s+/g,' ');
                if(html === '') {
                    $ = cheerio.load('');
                }
            }

                if (options.length === 0) {
                    return console.log('Source file not found.');
                }

                if (!fs.existsSync(options.dest) || !fs.lstatSync(options.dest).isDirectory()) {
                    mkdirp(options.dest);
                    console.log('Created output folder at "', options.dest, '"');
                }

                    var source = options.source;
                    var resolmap = {};

                    // Create resized version of source image
                    // 16x16: desktop browsers, address bar, tabs
                    // 32x32: safari reading list, non-retina iPhone, windows 7+ taskbar
                    // 48x48: windows desktop

                    var files = [];
                    var ext = path.extname(source);
                    var basename = path.basename(source, ext);
                    var dirname = path.dirname(source);
                    var prefix = options.precomposed ? "-precomposed" : "";
                    var additionalOpts = options.appleTouchBackgroundColor !== "none" ?
                        [ "-background", '"' + options.appleTouchBackgroundColor + '"', "-flatten"] : [];
                    console.log('Resizing images for "' + source + '"... ');

                    if (options.regular) {

                        // regular png
                        ['16x16', '32x32', '48x48'].forEach(function(size) {
                            var p = path.join(dirname, basename + "." + size + ext);
                            var saveTo = path.join(options.dest, size + '.png');
                            var src = source;
                            if (fs.existsSync(p)) {
                                src = p;
                            }
                            convert([src, '-resize', size, saveTo]);
                            files.push(saveTo);
                        });
                        console.log("okay");

                        // favicon.ico
                        console.log('favicon.ico... ');
                        convert(files.concat([
                            "-alpha on",
                            "-background none",
                            options.trueColor ? "" : "-bordercolor white -border 0 -colors 64",
                            path.join(options.dest, 'favicon.ico')
                        ]));
                        console.log("okay");

                        // 64x64 favicon.png higher priority than .ico
                        console.log('favicon.png... ');
                        convert([source, '-resize', "64x64", path.join(options.dest, 'favicon.png')]);
                        console.log("okay");
                    }

                    ////// PNG's for iOS and Android icons

                    if (options.apple) {
                        // Convert options for transparent and flatten
                        if (options.appleTouchBackgroundColor === "auto") {
                            options.appleTouchBackgroundColor = generateColor(source);
                        }

                        // 57x57: iPhone non-retina, Android 2.1+
                        console.log('apple-touch-icon.png... ');
                        convert(combine(source, options.dest, "57x57", "apple-touch-icon.png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");

                        if (options.precomposed) {
                            console.log('apple-touch-icon' + prefix + '.png... ');
                            convert(combine(source, options.dest, "57x57", "apple-touch-icon" + prefix + ".png", additionalOpts, options.appleTouchPadding));
                            console.log("okay");
                        }

                        // 60x60: iPhone iOS 7 without size
                        console.log('apple-touch-icon-60x60-precomposed.png... ');
                        convert(combine(source, options.dest, "60x60", "apple-touch-icon-60x60-precomposed.png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");

                        // 72x72: iPad non-retina, iOS 6 and lower
                        console.log('apple-touch-icon-72x72' + prefix + '.png... ');
                        convert(combine(source, options.dest, "72x72", "apple-touch-icon-72x72" + prefix + ".png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");

                        // 76x76: iPad non-retina, iOS 7 and higher
                        console.log('apple-touch-icon-76x76-precomposed.png... ');
                        convert(combine(source, options.dest, "76x76", "apple-touch-icon-76x76-precomposed.png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");

                        // 114x114: iPhone retina, iOS 6 and lower
                        console.log('apple-touch-icon-114x114' + prefix + '.png... ');
                        convert(combine(source, options.dest, "114x114", "apple-touch-icon-114x114" + prefix + ".png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");

                        // 120x120: iPhone retina, iOS 7 and higher
                        console.log('apple-touch-icon-120x120-precomposed.png... ');
                        convert(combine(source, options.dest, "120x120", "apple-touch-icon-120x120-precomposed.png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");

                        // 144x144: iPad retina, iOS 6 and lower
                        console.log('apple-touch-icon-144x144' + prefix + '.png... ');
                        convert(combine(source, options.dest, "144x144", "apple-touch-icon-144x144" + prefix + ".png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");

                        // 152x152: iPad retina, iOS 7 and higher
                        console.log('apple-touch-icon-152x152-precomposed.png... ');
                        convert(combine(source, options.dest, "152x152", "apple-touch-icon-152x152-precomposed.png", additionalOpts, options.appleTouchPadding));
                        console.log("okay");
                    }

                    // 228x228: Coast
                    if (options.coast) {
                        console.log('coast-icon-228x228.png... ');
                        convert(combine(source, options.dest, "228x228", "coast-icon-228x228.png", additionalOpts));
                        console.log("okay");
                    }

                    // Android Homescreen app
                    if (options.androidHomescreen) {
                        console.log('homescreen-196x196.png... ');
                        convert(combine(source, options.dest, "196x196", "homescreen-196x196.png", additionalOpts));
                        console.log("okay");
                    }

                    // Firefox
                    if (options.firefox) {
                        var updateFirefoxManifest = (options.firefoxManifest !== undefined && options.firefoxManifest !== ''),
                          contentFirefox;

                        if (updateFirefoxManifest) {
                            var contentsFirefox = (fs.existsSync(options.firefoxManifest)) ? fs.read(options.firefoxManifest) : '{}';
                            contentFirefox = JSON.parse(contentsFirefox);
                            contentFirefox.icons = {};
                        }

                        ['16', '30', '32', '48', '60', '64', '90', '120', '128', '256'].forEach(function(size) {
                            var dimensions = size + 'x' + size;
                            var dhalf = "circle "+size/2+","+size/2+" "+size/2+",1";
                            var fifname = "firefox-icon-" + dimensions + ".png";
                            console.log(fifname + '... ');
                            convert(combine(source, options.dest, dimensions, fifname, []));

                            if (options.firefoxRound) {
                                convert(["-size", dimensions, "xc:none", "-fill", path.join(options.dest, fifname), "-draw", '"'+dhalf+'"', path.join(options.dest, fifname)]);
                            }

                            if (updateFirefoxManifest) {
                                contentFirefox.icons[size] = options.HTMLPrefix + fifname;
                            }

                            console.log("okay");
                        });

                        if (updateFirefoxManifest) {
                            console.log('Updating Firefox manifest... ');

                            fs.writeFileSync(options.firefoxManifest, JSON.stringify(contentFirefox, null, 2));
                        }

                        console.log("okay");
                    }

                    ////// Windows 8 Tile

                    if (options.windowsTile) {

                        console.log('windows-tile-144x144.png... ');

                        // MS Tiles

                        if (options.tileBlackWhite) {
                            additionalOpts = [
                                "-fuzz 100%",
                                "-fill black",
                                "-opaque red",
                                "-fuzz 100%",
                                "-fill black",
                                "-opaque blue",
                                "-fuzz 100%",
                                "-fill white",
                                "-opaque green"
                            ];
                        } else {
                            additionalOpts = [];
                        }

                        // Tile BG color (experimental)
                        if (options.tileColor === "auto") {
                            options.tileColor = generateTileColor(source);
                        }

                        // Setting background color in image
                        if (!needHTML) {
                            if (options.tileColor !== "none") {
                                additionalOpts = additionalOpts.concat([
                                    "-background",
                                    '"' + options.tileColor + '"',
                                    "-flatten"
                                ]);
                            }
                        }

                        convert(combine(source, options.dest, "70x70", "windows-tile-70x70.png", additionalOpts));
                        convert(combine(source, options.dest, "144x144", "windows-tile-144x144.png", additionalOpts));
                        convert(combine(source, options.dest, "150x150", "windows-tile-150x150.png", additionalOpts));
                        convert(combine(source, options.dest, "310x310", "windows-tile-310x310.png", additionalOpts));
                        console.log("okay");

                    }

                    // Append icons to <HEAD>
                    if (needHTML) {
                        console.log('Updating HTML... ');
                        var elements = "";

                        if (options.windowsTile) {
                            elements += "\t<meta name=\"msapplication-square70x70logo\" content=\"" + options.HTMLPrefix + "windows-tile-70x70.png\"/>\n";
                            elements += "\t<meta name=\"msapplication-square150x150logo\" content=\"" + options.HTMLPrefix + "windows-tile-150x150.png\"/>\n";
                            elements += "\t<meta name=\"msapplication-square310x310logo\" content=\"" + options.HTMLPrefix + "windows-tile-310x310.png\"/>\n";
                            elements += "\t<meta name=\"msapplication-TileImage\" content=\"" + options.HTMLPrefix + "windows-tile-144x144.png\"/>\n";
                            if (options.tileColor !== "none") {
                                elements += "\t<meta name=\"msapplication-TileColor\" content=\"" + options.tileColor + "\"/>\n";
                            }
                        }

                        // iOS
                        if (options.apple) {
                            elements += "\t<link rel=\"apple-touch-icon-precomposed\" sizes=\"152x152\" href=\"" + options.HTMLPrefix + "apple-touch-icon-152x152-precomposed.png\">\n";
                            elements += "\t<link rel=\"apple-touch-icon-precomposed\" sizes=\"120x120\" href=\"" + options.HTMLPrefix + "apple-touch-icon-120x120-precomposed.png\">\n";

                            elements += "\t<link rel=\"apple-touch-icon-precomposed\" sizes=\"76x76\" href=\"" + options.HTMLPrefix + "apple-touch-icon-76x76-precomposed.png\">\n";
                            elements += "\t<link rel=\"apple-touch-icon-precomposed\" sizes=\"60x60\" href=\"" + options.HTMLPrefix + "apple-touch-icon-60x60-precomposed.png\">\n";

                            elements += "\t<link rel=\"apple-touch-icon" + prefix + "\" sizes=\"144x144\" href=\"" + options.HTMLPrefix + "apple-touch-icon-144x144" + prefix + ".png\">\n";
                            elements += "\t<link rel=\"apple-touch-icon" + prefix + "\" sizes=\"114x114\" href=\"" + options.HTMLPrefix + "apple-touch-icon-114x114" + prefix + ".png\">\n";

                            elements += "\t<link rel=\"apple-touch-icon" + prefix + "\" sizes=\"72x72\" href=\"" + options.HTMLPrefix + "apple-touch-icon-72x72" + prefix + ".png\">\n";
                            elements += "\t<link rel=\"apple-touch-icon\" sizes=\"57x57\" href=\"" + options.HTMLPrefix + "apple-touch-icon.png\">\n";
                        }

                        // Coast browser
                        if (options.coast) {
                          elements += "\t<link rel=\"icon\" sizes=\"228x228\" href=\"" + options.HTMLPrefix + "coast-icon-228x228.png\" />\n";
                        }

                        // Android Homescreen app
                        if (options.androidHomescreen) {
                          elements += "\t<meta name=\"mobile-web-app-capable\" value=\"yes\" />\n";
                          elements += "\t<link rel=\"icon\" sizes=\"196x196\" href=\"" + options.HTMLPrefix + "homescreen-196x196.png\" />\n";
                        }

                        // Default
                        if (options.regular) {
                            elements += "\t<link rel=\"shortcut icon\" href=\"" + options.HTMLPrefix + "favicon.ico\" />\n";
                            elements += "\t<link rel=\"icon\" type=\"image/png\" sizes=\"64x64\" href=\"" + options.HTMLPrefix + "favicon.png\" />\n";
                        }

                        // Windows 8 tile. In HTML version background color will be as meta-tag

                        if($('head').length > 0) {
                          $("head").append(elements);
                        } else {
                          $.root().append(elements);
                        }

                        var out = $.html();

                        // Hack for php tags
                        if (path.extname(options.html) === ".php") {
                            out = out.replace(/&lt;\?/gi, '<?').replace(/\?&gt;/gi, '?>');
                        }

                        // Saving HTML
                        fs.writeSync(options.html, out);

                        console.log("okay");
                    }

                    // Cleanup
                    if (options.regular) {
                        ['16x16', '32x32', '48x48'].forEach(function(size) {
                            fs.unlink(path.join(options.dest, size + '.png'));
                        });
                    }




    };

}());
