"use strict";
var _ = require('lodash');
var request = require('request');
var cheerio = require('cheerio');
var schedule = require('node-schedule');
var moment = require('moment');
var RSVP = require('rsvp');
var nodemailer = require('nodemailer');
var fs = require("fs");

var config = require('./config');

let processedAds = loadProcessedAds() || [];

class Ad {
    constructor(url, image, title, description, location, price, datePosted) {
        this.url = url;
        this.image = image;
        this.title = title;
        this.description = description;
        this.location = location;
        this.price = price;
        this.isBusiness = null;
        this.datePosted = datePosted;
    }

    static buildAd($jquerySelector) {
        var ad = new Ad();

        ad.url = 'http://www.kijiji.ca' + $jquerySelector.attr('data-vip-url');
        ad.image = $jquerySelector.find('.image img').attr('src');
        ad.title = $jquerySelector.find('a.title').text().trim();
        ad.description = $jquerySelector.find('.description').text().trim();
        ad.location = $jquerySelector.find('.location').text().trim();
        ad.price = $jquerySelector.find('.price').text().trim();
        ad.datePosted = Ad.determineDatePosted($jquerySelector.find('.date-posted').text().trim());

        return ad;
    }

    static determineDatePosted(datePostedText) {
        if (!datePostedText) {
            return null;
        }

        var relativeTimeRegex = /(\d+) (hour|minute|second)s? ago/;
        var match = relativeTimeRegex.exec(datePostedText);
        if (match != null) {
            return moment().subtract(match[1], match[2]);
        }

        if (datePostedText === 'Yesterday') {
            return moment().subtract(1, 'day');
        }

        var parsedDateString = moment(datePostedText, 'DD-MM-YYYY');
        if (parsedDateString.isValid()) {
            return parsedDateString;
        }

        console.error("Unexpected date posted text:" + datePostedText);
        return moment();
    }

    queryIsBusinessAd() {
        return new RSVP.Promise((resolve, reject) => {
            request(this.url, (error, response, html) => {
                const $ = cheerio.load(html);
                const adProfile = $('#R2SProfile').text();
                this.isBusiness = adProfile.includes('Business') || adProfile.includes('Retail');
                resolve(this);
            });
        });
    }

    isEqual(ad) {
        return ad.url === this.url;
    }

    isInList(ads) {
        return _.some(ads, ad => this.isEqual(ad));
    }

    toHtml() {
        return `<tr><td><a href="${this.url}">${this.title}</a> Price: ${this.price}</td></tr>` +
        `<tr><td>${this.location}</td></tr>` +
        `<tr><td>${this.description}</td></tr>` +
        `<tr><td><a href="${this.url}"><img src="${this.image}"/></a></td></tr>` +
        `<tr><td>&nbsp;</td></tr>`;
    }
}

function loadProcessedAds() {
    try {
        return require("./processedAds.json")
    } catch(e) {
        return [];
    }
}

var failedToSave = false;
function saveProcessedAds(processedAds) {
    try {
        fs.writeFile( "processedAds.json", JSON.stringify(processedAds, null, '\t'), "utf8");
    } catch (e) {
        if (!failedToSave) {
            console.error("unable to save processed ads")
        }
        failedToSave = true;
    }
}

function updateItems() {
    const promises = config.urls.map(url => createAdFetchPromise(url));

    return RSVP.Promise.all(promises)
        .then(parsedAdsList => {
            const fetchedAds = parsedAdsList.reduce((adList1, adList2) => adList1.concat(adList2));

            if (!config.noBusinessAds) {
                processNewAds(fetchedAds);
            }

            const promises = fetchedAds.map(ad => ad.queryIsBusinessAd())
            return RSVP.Promise.all(promises)
                .then(adList => adList.filter(adItem => !adItem.isBusiness))
                .then(adList => processNewAds(adList))
        }).then(() => {
            console.log(`Ads updated, number of ads: ${processedAds.length}`);
        })
}

function createAdFetchPromise(url) {
    return new RSVP.Promise((resolve, reject) => {
        request(url, (error, response, html) => {
            const $ = cheerio.load(html);

            const parsedAds = $('div.search-item').get()
                .map(item => Ad.buildAd($(item)))

            resolve(parsedAds);
        });
    });
}

function processNewAds(fetchedAds) {
    let newAds = fetchedAds.filter(ad => !ad.isInList(processedAds));
    newAds = _.uniqBy(newAds, 'url');
    newAds = _.orderBy(newAds, ['datePosted'], ['desc']);

    if (!newAds.length) {
        return;
    }

    emailAds(newAds);
    processedAds = processedAds.concat(newAds);
    saveProcessedAds(processedAds);
}

function emailAds(ads) {
    logAdsBeingEmailed(ads);

    let transporter = getMailerTransport();
    if (!transporter) {
        return;
    }

    // setup e-mail data with unicode symbols
    let mailOptions = {
        from: 'Kijiji Scraper <noreply@example.com>', // sender address
        to: `${config.email.gmailUser}@gmail.com`, // list of receivers
        subject: createAdsFoundMessage(ads), // Subject line
        text: JSON.stringify(ads), // plaintext body
        html: formatAds(ads) // html body
    };


    // send mail with defined transport object
    transporter.sendMail(mailOptions, error => {
        if (error) {
            return console.log(`Email failed: ${error}`);
        }

        console.log(`Email sent successfully`);
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
    console.log(createAdsFoundMessage(ads));
    ads.forEach(ad => {
        console.log(`emailing new ad: ${ad.title}`);
    });
    console.log(``);
}

function createAdsFoundMessage(ads) {
    return `We found ${ads.length} new ads for you :)`;
}

function formatAds(ads) {
    const adsFoundMessage = createAdsFoundMessage(ads);
    const adsTableRows = ads.map(ad => ad.toHtml());

    return `<h1>${adsFoundMessage}</h1>` +
    `<table>${adsTableRows}</table>`;
}

const cronRule = `*/${config.minutesBetweenCheck} * * * *`;
schedule.scheduleJob(cronRule, updateItems);

console.log('Kijiji Scrapper started.');
console.log(`Watching the following page for new ads: \n${config.urls.join('\n')}`);

console.log();

updateItems();
