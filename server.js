"use strict";
const axios = require('axios');
const _ = require('lodash');
const cheerio = require('cheerio');
const schedule = require('node-schedule');
const moment = require('moment');
const Queue = require('smart-request-balancer');
const RSVP = require('rsvp');
const nodemailer = require('nodemailer');
const fs = require("fs");
const { Ad } = require('./classes/ad.js');
const { AdStore } = require('./classes/ad-store.js');
const { ProgressIndicator } = require('./classes/progress-indicator');

const config = require('./config');

const requestQueue = new Queue({
    overall: {
        limit: 2,
        rate: 1,
    },
    retryTime: 300,
    ignoreOverallOverheat: true
})

console.log('--------------------------------------------')
console.log('Kijiji Scrapper started');
console.log('--------------------------------------------\n')

console.log(`Watching the following page for new ads: \n${config.urls.map(u => u.url ? u.url : u).join('\n')}\n`);

const adStore = new AdStore();

schedule.scheduleJob(`*/${config.minutesBetweenCheck} * * * *`, updateItems);
let updatePromise = Promise.resolve()
updateItems();

function updateItems() {
    updatePromise = updatePromise
        .then(() => getAdListPromises())
        .then(adListPromises => RSVP.Promise.all(adListPromises))
        .then(parsedAdsList => {
            const fetchedAds = parsedAdsList.reduce((adList1, adList2) => adList1.concat(adList2));
            const newAds = adStore.add(fetchedAds);

            const adPromises = getAdPromises(newAds)

            return adPromises
                .then(adList => adList.filter(adItem => !adItem.isIgnored))
                .then(adList => adList.filter(adItem => !adItem.isBusiness))
                .then(adList => {
                    const ignoredCount = newAds.length - adList.length;
                    console.log(`fetched ${fetchedAds.length} ads, ${newAds.length} new, ${ignoredCount} ignored, emailing ${adList.length}`);
                    emailAds(adList);
                })

        })
        .then(() => console.log(`Ads updated, total ads in datastore: ${adStore.length}\n`))
        .catch(err => console.error('error fetching things:', err))
}

function getAdListPromises() {
    const progressIndicator = new ProgressIndicator('ad lists', config.urls.length)

    return config.urls
        .map(urlConfig =>
            createAdFetchPromise(urlConfig)
                .then(adList => {
                    progressIndicator.oneComplete()
                    return adList
                })
        )
}

function getAdPromises(newAds) {
    const requiresAdditionalDetails = config.highQualityEmails
    if (!requiresAdditionalDetails) {
        return Promise.resolve(newAds)
    }

    console.log('')
    const progressIndicator = new ProgressIndicator('ad additional details', newAds.length)
    const adPromises = newAds.map(ad => ad.loadAdditionalDetails().then(ad => {
        progressIndicator.oneComplete()
        return ad
    }))

    return RSVP.Promise.all(adPromises)
}

function createAdFetchPromise(urlConfig) {
    let url;
    let ignores
    if (typeof urlConfig === 'string') {
        url = urlConfig
    } else {
        url = urlConfig.url
        ignores = _.get(urlConfig, 'ignores', [])
    }

    if (_.isEmpty(url)) {
        console.log(`invalid URL config: ${urlConfig}`)
        return RSVP.Promise.resolve([])
    }
    return requestQueue.request(retry =>
        axios
            .get(url)
            .then(response => {
                const $ = loadCheerio(response.data);
                if (!$) {
                    console.log(`Failed to load ad list: ${url}`)
                    return []
                }

                const parsedAds = $('div.search-item')
                    .get()
                    .map(item => {
                        return Ad.buildAd($(item), ignores, requestQueue)
                    })

                return parsedAds
            }))
}

function loadCheerio(html) {
    try {
        return cheerio.load(html);
    } catch (e) {
        console.error('cheerio is a failure :(');
    }
}

function emailAds(ads) {
    if (!ads.length) {
        return
    }

    logAdsBeingEmailed(ads);

    let transporter = getMailerTransport();
    if (!transporter) {
        return;
    }

    // setup e-mail data with unicode symbols
    let mailOptions = {
        from: 'Kijiji Scraper <noreply@example.com>', // sender address
        to: `${config.email.targetEmail}`, // list of receivers
        subject: createAdsFoundMessage(ads), // Subject line
        text: JSON.stringify(ads), // plaintext body
        html: formatAds(ads) // html body
    };

    // send mail with defined transport object
    transporter.sendMail(mailOptions, error => {
        if (error) {
            return console.log(`Email failed: ${error}`);
        }

        console.log('Email sent successfully\n');
    });
}

function getMailerTransport() {
    if (config.email.gmailPassword) {
        return nodemailer.createTransport(
            `smtps://${config.email.gmailUser}%40gmail.com:${config.email.gmailPassword}@smtp.gmail.com`);
    }

    if (!config.email.oauth.clientId || !config.email.oauth.clientSecret || !config.email.oauth.refreshToken) {
        console.log('Could not initialize mailer as password was empty and no oauth credentials were provided')
        return null;
    }

    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            type: "OAuth2",
            user: config.email.gmailUser,
            clientId: config.email.oauth.clientId,
            clientSecret: config.email.oauth.clientSecret,
            refreshToken: config.email.oauth.refreshToken
        }
    });
}

function logAdsBeingEmailed(ads) {
    console.log('\n' + createAdsFoundMessage(ads));
    ads.forEach(ad => {
        console.log(`emailing new ad: ${ad.title}`);
    });
    console.log(``);
}

function createAdsFoundMessage(ads) {
    const numberOfAds = ads.length;
    const pluralization = numberOfAds === 1 ? 'ad' : 'ads'
    return `${numberOfAds} new ${pluralization}`;
}

function formatAds(ads) {
    const adsFoundMessage = createAdsFoundMessage(ads);
    const adsTableRows = ads.map(ad => ad.toHtml());

    return `<h1>${adsFoundMessage}</h1>` +
        `<table>${adsTableRows.join('')}</table>`;
}
