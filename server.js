"use strict";
var _ = require('lodash');
var request = require('request');
var cheerio = require('cheerio');
var schedule = require('node-schedule');
var moment = require('moment');
var RSVP = require('rsvp');
var nodemailer = require('nodemailer');
var fs = require("fs");
const { Ad } = require('./classes/ad.js');
const { AdStore } = require('./classes/ad-store.js');
const { ProgressIndicator } = require('./classes/progress-indicator');

var config = require('./config');

console.log('--------------------------------------------')
console.log('Kijiji Scrapper started');
console.log('--------------------------------------------\n')

console.log(`Watching the following page for new ads: \n${config.urls.join('\n')}\n`);

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
            console.log(`fetched ${fetchedAds.length} ads, ${newAds.length} were new ads`)

            const adPromises = getAdPromises(newAds)

            return RSVP.Promise.all(adPromises)
                .then(adList => adList.filter(adItem => !adItem.isBusiness))
                .then(adList => emailAds(adList))

        })
        .then(() => console.log(`Ads updated, total ads in datastore: ${adStore.length}\n`))
}

function getAdListPromises() {
    const progressIndicator = new ProgressIndicator('ad lists', config.urls.length)

    return config.urls.map(url => createAdFetchPromise(url).then(adList => {
        progressIndicator.oneComplete();
        return adList
    }));
}

function getAdPromises(newAds) {
    const requiresAdditionalDetails = config.noBusinessAds || config.highQualityEmails
    if (!requiresAdditionalDetails) {
        return Promise.resolve(newAds)
    }

    console.log('')
    const progressIndicator = new ProgressIndicator('ad additional details', newAds.length)
    return newAds.map(ad => ad.loadAdditionalDetails().then(ad => {
        progressIndicator.oneComplete();
        return ad
    }))
}

function createAdFetchPromise(url) {
    return new RSVP.Promise((resolve, reject) => {
        request(url, (error, response, html) => {
            const $ = loadCheerio(html);
            if (!$) {
                return
            }

            const parsedAds = $('div.search-item').get()
                .map(item => Ad.buildAd($(item)))

            resolve(parsedAds);
        });
    });
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
        `<table>${adsTableRows}</table>`;
}