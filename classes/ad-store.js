var fs = require("fs");
var _ = require('lodash');

const storageFileName = 'ad-storage.json'

class AdStore {
    constructor() {
        this.ads = []
        this.failedToSave = false
        this.load()
    }

    load() {
        try {
            this.ads = JSON.parse(fs.readFileSync(storageFileName)) || []
            console.log(`Datastore loaded ${this.ads.length} ads\n`)
        } catch (e) {
            console.log('No datastore found. Will create a new one.')
            this.data = []
        }
    }

    save() {
        fs.writeFile(storageFileName, JSON.stringify(this.ads, null, '\t'), err => {
            if (!err) {
                return
            }

            if (!this.failedToSave) {
                console.error("unable to save processed ads", err)
            }
            this.failedToSave = true;
        });
    }

    add(ads) {
        let newAds = ads.filter(ad => !ad.isInList(this.ads));

        newAds = _.uniqBy(newAds, 'url');
        newAds = _.orderBy(newAds, ['datePosted'], ['desc']);

        if (!newAds.length) {
            return [];
        }

        this.ads.push(...newAds);
        this.save();

        return newAds;
    }

    get length() {
        return this.ads.length
    }
}

exports.AdStore = AdStore
