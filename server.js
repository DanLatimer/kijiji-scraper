"use strict";
var request = require('request');
var cheerio = require('cheerio');
var schedule = require('node-schedule');
var RSVP = require('rsvp');
var nodemailer = require('nodemailer');

var config = require('./config');

let processedAds = [];

class Ad {
    constructor(url, image, title, description, location, price) {
        this.url = url;
        this.image = image;
        this.title = title;
        this.description = description;
        this.location = location;
        this.price = price;
        this.isBusiness = null;
    }

    static buildAd($jquerySelector) {
        var ad = new Ad();

        ad.url = 'http://www.kijiji.ca' + $jquerySelector.attr('data-vip-url');
        ad.image = $jquerySelector.find('.image img').attr('src');
        ad.title = $jquerySelector.find('a.title').text().trim();
        ad.description = $jquerySelector.find('.description').text().trim();
        ad.location = $jquerySelector.find('.location').text().trim();
        ad.price = $jquerySelector.find('.price').text().trim();

        return ad;
    }

    queryIsBusinessAd() {
	    return new RSVP.Promise((resolve, reject) => {
            request(this.url, (error, response, html) => {
                if (error) {
                    reject();
                    return;
                }

                const $ = cheerio.load(html);
                this.isBusiness = $('.ad-attributes tr').get()
                    .filter(item => $(item).find('th').text().includes('For Sale By'))
                    .every(item => $(item).find('td').text().includes('Business'))
                resolve(this);
            });
	    });
    }

    isEqual(ad) {
        return ad.url === this.url;
    }

    isInList(ads) {
        return ads.filter(ad => this.isEqual(ad)).length > 0;
    }

    toHtml() {
        return `<tr><td><a href="${this.url}">${this.title}</a> Price: ${this.price}</td></tr>` +
        `<tr><td>${this.location}</td></tr>` +
        `<tr><td>${this.description}</td></tr>` +
        `<tr><td><a href="${this.url}"><img src="${this.image}"/></a></td></tr>` +
        `<tr><td>&nbsp;</td></tr>`;
    }
}

function updateItems() {
    const promises = config.urls.map(url => createAdFetchPromise(url));

    return RSVP.Promise.all(promises).then(parsedAdsList => {
        const fetchedAds = parsedAdsList.reduce((adList1, adList2) => adList1.concat(adList2));

        if (config.noBusinessAds) {
            const promises = fetchedAds.map(ad => ad.queryIsBusinessAd())
            RSVP.Promise.all(promises).then(adList => {
                adList = adList.filter(adItem => !adItem.isBusiness);
                processNewAds(adList);
            });
            return;
        }

        processNewAds(fetchedAds);
    }).then(() => {
        console.log(`Ads updated, number of ads: ${processedAds.length}`);
    });
}

function createAdFetchPromise(url) {
    return new RSVP.Promise((resolve, reject) => {
        request(url, (error, response, html) => {
            if (error) {
                reject();
                return;
            }

            const $ = cheerio.load(html);
            const parsedAds = $('div.search-item').get()
                .map(item => Ad.buildAd($(item)));
            
            resolve(parsedAds);
        });
    });
}

function processNewAds(fetchedAds) {
    const newAds = fetchedAds.filter(ad => !ad.isInList(processedAds));

    if (!newAds.length) {
        return;
    }

    emailAds(newAds);
    processedAds = processedAds.concat(newAds);
}

function emailAds(ads) {
    logAdsBeingEmailed(ads);

    // create reusable transporter object using the default SMTP transport
    let transporter = nodemailer.createTransport(
        `smtps://${config.email.gmailUser}%40gmail.com:${config.email.gmailPassword}@smtp.gmail.com`);

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
