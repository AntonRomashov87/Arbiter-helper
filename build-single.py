# Збирає один самодостатній файл arbitr-single.html з index.html + style.css + *.js
import re
s=open('index.html',encoding='utf8').read()
s=s.replace('<link rel="stylesheet" href="style.css">','<style>\n'+open('style.css',encoding='utf8').read()+'</style>')
for f in ['chess','logic','data','ui']:
    s=s.replace('<script src="%s.js"></script>'%f,'<script id="%s">\n'%('chessjs' if f=='chess' else f)+open(f+'.js',encoding='utf8').read().replace('</script','<\\/script')+'</script>')
open('arbitr-single.html','w',encoding='utf8').write(s);print('ok')
