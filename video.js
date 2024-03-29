#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const html = fs.readFileSync(__dirname+'/video.html', "utf-8")
const img = fs.readFileSync(__dirname+'/favicon.ico');
const index='<!DOCTYPE html>\n<html>\n<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<style>body {color: white;background: black;}</style></head>\n<body>\n<ul>\n{dir}\n</ul>\n</body>\n</html>'
var folders={}
const options = {
    key: fs.readFileSync(__dirname+'/key.pem'),
    cert: fs.readFileSync(__dirname+'/cert.pem')
};
function compare(a,b) {
    if (a.size < b.size)
        return -1;
    if (a.size > b.size)
        return 1;
    return 0;
}
function favicon(res){
    res.writeHead(200, {'Content-Type': 'image/x-icon'});
    res.write(img, 'binary');
    res.end();
}
function root(res,path){
    fs.readdir(__dirname,(err,files)=>{
        files=files.filter(file=>(file.indexOf(".")!=0))
        files=files.filter(file=>fs.statSync(__dirname+"/"+file).isDirectory())
        for(let i=0;i<files.length;i++){
            if(!folders["/"+files[i]])folders["/"+files[i]]=[]
        }
        var dir="";
        for(i=0;i<files.length;i++){
            dir+="<li><A href='"+files[i].replace(/ /g,"_")+"'>"+files[i]+"</A></li>\n";
        }
        res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
        res.write(index.replace(/{path}/g,path.substr(1)).replace("{dir}",dir));
        res.end();
    })
}
function main(req,res,path){
    if(path.indexOf(".")!=-1){
        var i=path.lastIndexOf("/")
        var video=path.substr(i+1)
        video=parseInt(video.substring(0,video.indexOf(".")))
        path=path.substr(0,i)
        if(folders[path] && folders[path][video]){
            path=path+"/"+folders[path][video].name
            fs.stat(__dirname+path, function(err, stats) {
                if (err) {
                    if (err.code === 'ENOENT') {
                        // 404 Error if file not found
                        res.writeHead(404, {"Content-Type": "text/html"});
                        res.write("<h1 align='center'>404 Not Found</h1>");
                        res.end();
                    }
                }
                else{
                    var range = req.headers.range;
                    if (!range) {
                        var file=fs.readFile(__dirname+path,(err,data)=>{
                            res.writeHead(200, {"Content-Type": "video/mp4","Content-Length":Buffer.byteLength(data)});
                            res.write(data);
                            res.end();
                        })
                    }
                    else{
                        var positions = range.replace(/bytes=/, "").split("-");
                        var start = parseInt(positions[0], 10);
                        var total = stats.size;
                        var end = positions[1] ? parseInt(positions[1], 10) : total - 1;
                        var chunksize = (end - start) + 1;
                        if(start>end){
                            // 416 Wrong range
                            console.log(path)
                            console.log(range)
                            res.writeHead(416, {"Content-Type": "text/html"});
                            res.write("<h1 align='center'>416 Wrong range</h1>");
                            res.end();
                        }
                        else{
                            res.writeHead(206, {
                                "Content-Range": "bytes " + start + "-" + end + "/" + total,
                                "Accept-Ranges": "bytes",
                                "Content-Length": chunksize,
                                "Content-Type": "video/mp4"
                            });
                            var stream = fs.createReadStream(__dirname+path, { start: start, end: end })
                                .on("open", function() {
                                    stream.pipe(res);
                                }).on("error", function(err) {
                                    console.log(err)
                                    res.end(err);
                                });
                        }

                    }
                }
            });
        }
        else{
            if(folders[path])
                console.log(path+"/"+video)
            else
                console.log(path)
            res.writeHead(404, {"Content-Type": "text/html"});
            res.write("<h1 align='center'>404 Not Found</h1>");
            res.end();
        }
    }
    else{
        path=path.replace(/_/g," ");
        if (fs.existsSync(__dirname+path)) {
            folders[path]=fs.readdirSync(__dirname+path)
            folders[path] = folders[path].filter(file=>(file.indexOf(".")!=-1));
            if(folders[path][0]){
                for(let i=0;i<folders[path].length;i++){
                    var datos = fs.statSync(__dirname+path+"/"+folders[path][i])
                    folders[path][i]={name: folders[path][i], size: datos.size}
                }
                if(path=="/ver" || path=="/podcast"){
                    folders[path].sort(compare)
                }
            }
            var dir=""
            for(i=0;i<folders[path].length;i++){
                dir+="<li><A href='"+path+"/"+i+".mp4'>"+i+": "+folders[path][i].name+"</A></li>\n";
            }
            res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
            res.write(html.replace(/{path}/g,path.substr(1)).replace("{dir}",dir));
            res.end();
        }
        else{
            var dir="";
            res.writeHead(200, {'Content-Type': 'text/html;charset=utf-8'});
            res.write(html.replace(/{path}/g,path.substr(1)).replace("{dir}",dir));
            res.end();
        }
    }
}
https.createServer(options,function (req, res) {
    var path = decodeURI(req.url);
    switch(path){
        case '/favicon.ico':
            favicon(res)
            break;
        case '/':
            root(res,path)
            break;
        default:
            main(req,res,path)
            break;
    }
}).listen(443);
var http = require('http');
http.createServer(function (req, res) {
    res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
    res.end();
}).listen(80);
