#!/bin/zsh
# index.html（Apps Scriptに貼るファイル）と docs/index.html（GitHub Pagesで公開するページ）を組み立てる
cd "$(dirname "$0")"
reset='<style>html,body{margin:0;-webkit-text-size-adjust:100%}*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}</style>'
{
  echo '<!DOCTYPE html><html><head><base target="_top"><meta charset="utf-8">'
  echo "$reset</head><body>"
  cat head.html data-s5.js data-s4.js data-w.js app-gas.js
  echo '</body></html>'
} > index.html
mkdir -p docs
{
  echo '<!DOCTYPE html><html lang="ja"><head><meta charset="utf-8">'
  echo '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
  echo '<meta name="robots" content="noindex,nofollow">'
  echo '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="英検カード">'
  echo "$reset</head><body>"
  cat head.html data-s5.js data-s4.js data-w.js app-gas.js
  echo '</body></html>'
} > docs/index.html
printf 'User-agent: *\nDisallow: /\n' > docs/robots.txt
echo "index.html: $(wc -c < index.html) bytes / docs/index.html: $(wc -c < docs/index.html) bytes"
