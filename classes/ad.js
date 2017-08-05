var _ = require('lodash');
var moment = require('moment');
var RSVP = require('rsvp');
var cheerio = require('cheerio');
var request = require('request');

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

exports.Ad = Ad
    //export default Ad