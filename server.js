"use strict";
var request = require('request');
var cheerio = require('cheerio');
var schedule = require('node-schedule');
var RSVP = require('rsvp');
var nodemailer = require('nodemailer');

var config = require('./config');

let processedAds = [];

class Ad {
    constructor(url, image, title, description, location) {
        this.url = url;
        this.image = image;
        this.title = title;
        this.description = description;
        this.location = location;
    }

    static buildAd($jquerySelector) {
        var ad = new Ad();

        ad.url = 'http://www.kijiji.ca' + $jquerySelector.attr('data-vip-url');
        ad.image = $jquerySelector.find('.image img').attr('src');
        ad.title = $jquerySelector.find('a.title').text().trim();
        ad.description = $jquerySelector.find('.description').text().trim();
        ad.location = $jquerySelector.find('.location').text().trim();

        return ad;
    }

    isEqual(ad) {
        return ad.url === this.url;
    }

    isInList(ads) {
        return ads.filter(ad => this.isEqual(ad)).length > 0;
    }
}

function updateItems() {
    return new RSVP.Promise((resolve, reject) => {

        request(config.url, (error, response, html) => {
            if(error) {
                reject();
                return;
            }

            const $ = cheerio.load(html);
            const $items = $('div.search-item');
            const parsedAds = $items.map(function (index, $item) {
                return Ad.buildAd($(this));
            }).get();

            const newAds = parsedAds.filter(ad => !ad.isInList(processedAds));

            if (newAds.length) {
                emailAds(newAds);
                processedAds = processedAds.concat(newAds);
            }

            resolve();
        });
    });
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
    transporter.sendMail(mailOptions, function(error){
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
    const adsTableRows = ads.map(ad =>
        `<tr><td><a href="${ad.url}">${ad.title}</a></td></tr>
        <tr><td>${ad.location}</td></tr>
        <tr><td>${ad.description}</td></tr>
        <tr><td><img src="${ad.image}"/></td></tr>
        <tr><td>&nbsp;</td></tr>`);

    const adsFoundMessage = createAdsFoundMessage(ads);

    return `<h1>${adsFoundMessage}</h1>
    <table>${adsTableRows}</table>`;
}

const cronRule = `* */${config.minutesBetweenCheck} * * * *`;
schedule.scheduleJob(cronRule, () => {
    updateItems().then(() => {
        console.log(`Ads updated, number of ads: ${processedAds.length}`);
    });
});

console.log('Kijiji Scrapper started.');
console.log(`Watching the following page for new ads: ${config.url}`);
console.log(`Polling for new ads every ${config.minutesBetweenCheck} minutes.`);
console.log();
