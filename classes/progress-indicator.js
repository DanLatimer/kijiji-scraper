var Jetty = require('jetty')

var jetty = new Jetty(process.stdout);

class ProgressIndicator {
    constructor(itemBeingLoaded, numberOfItems) {
        this.itemBeingLoaded = itemBeingLoaded
        this.numberOfItems = numberOfItems
        this.numberComplete = 0
        this.numChars = 0

        if (this.numberOfItems > 0) {
            this._logProgress()
        }
    }

    oneComplete() {
        this.numberComplete++;
        this._logProgress()
    }

    _logProgress() {
        jetty.clearLine();
        jetty.moveRight(this.numChars);

        const percentComplete = this.numberComplete / this.numberOfItems
        const loader = this._createLoader(percentComplete)

        let text = `Loading ${this.numberOfItems} ${this.itemBeingLoaded}: ${loader} ${(percentComplete * 100).toFixed(2)}%`
        if (this.numberComplete >= this.numberOfItems) {
            text += '\n'
        }

        this.numChars = text.length
        jetty.text(text)
    }

    _createLoader(percentComplete) {
        const loadingSlots = 20
        const loadedSlots = Math.floor(loadingSlots * percentComplete)
        const unloadedSlots = loadingSlots - loadedSlots

        return '[' + '#'.repeat(loadedSlots) + ' '.repeat(unloadedSlots) + ']'
    }
}

exports.ProgressIndicator = ProgressIndicator