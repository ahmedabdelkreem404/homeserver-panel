# Final smoke with the installed final build (after the review, QA and /cso fixes)

```
$ hsdeploy up --expect "hs-static: Vite and React"
Creating project "hs-static"
Creating app "hs-static"
Creating domain hs-static.talabq.com (port 3000, HTTPS off, certificate none)
Running local build: npm run build
✓ 29 modules transformed.
✓ built in 1.24s
Packed 4 files into a 0.05 MB zip
Uploading with application.dropDeployment
Build and deploy finished in 2.5 s
Container app-reboot-primary-pixel-h5glcz.1.ovy3ysup0xqvaeo2n14u3973c is running and stable
Public check passed in 0.6 s
Deployed: https://hs-static.talabq.com
exit=0

$ curl -s -o /dev/null -w "HTTP %{http_code}" https://hs-static.talabq.com
HTTP 200 in 0.314302s

$ hsdeploy down --rm-project
OK   delete domain hs-static.talabq.com
OK   delete app hs-static
OK   wait for the app's containers to disappear
OK   remove built image
OK   delete empty project
Done.
exit=0

$ curl after down
HTTP 404
```
