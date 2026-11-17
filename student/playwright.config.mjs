import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'.',testMatch:['ui.spec.mjs','event.spec.mjs'],timeout:90000,workers:1,
 use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1440,height:1000},contextOptions:{reducedMotion:'reduce'},
 launchOptions:{args:['--enable-unsafe-swiftshader']}},
 webServer:{command:'node serve.mjs',url:'http://127.0.0.1:4173',reuseExistingServer:false},
 reporter:[['list'],['html',{open:'never'}]]
});
