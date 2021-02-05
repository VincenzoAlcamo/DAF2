// eslint-disable-next-line no-unused-vars
const PackTiles = (function () {

    function toBase26(n) {
        if (n < 26) return String.fromCharCode(n + 65);
        let c = n % 26;
        let s = '';
        while ((n = (n - c) / 26)) {
            s += String.fromCharCode(c + 97);
            c = n % 26;
        }
        return s + String.fromCharCode(c + 65);
    }

    function pack(tiles) {
        // const start = Date.now();
        const arr = tiles.split(';');
        const tileDict = {};
        const tileEnum = [];
        const tileOut = [];
        let lastTile = [-1, 0];
        const length = Math.ceil(arr.length / 8);
        const visArray = new Uint8Array(length);
        let visIndex = 0;
        let visBit = 1;
        arr.forEach((tileData) => {
            const [tileId, tileStatus, , tileSubtype, visible] = tileData.split(',');
            const key = tileId + '_' + tileSubtype + '_' + tileStatus;
            let tileIndex = tileDict[key];
            if (tileIndex === undefined) {
                tileIndex = tileEnum.length;
                tileEnum.push(toBase26(+tileId) + toBase26(+tileSubtype) + toBase26(+tileStatus));
                tileDict[key] = tileIndex;
            }
            if (tileIndex === lastTile[0]) lastTile[1]++;
            else tileOut.push(lastTile = [tileIndex, 1]);
            if (visible == '1') visArray[visIndex] += visBit;
            if (visBit == 128) { visBit = 1; visIndex++; } else { visBit *= 2; }
        });
        const te = tileEnum.join('');
        const to = tileOut.map(a => toBase26(a[0]) + toBase26(a[1])).join('');
        const tv = btoa(String.fromCharCode.apply(null, visArray));
        const output = te + ':' + to + ':' + tv;
        // const end = Date.now();
        // console.log(output);
        // console.log(`${tiles.length} -> ${output.length} in ${end - start}ms`);
        return output;
    }

    function unpackTuples(data, i, len, out) {
        let n = 0;
        let m = 1;
        let tuple = [];
        let tupleIndex = 0;
        for (let c; (c = data.charCodeAt(i++)) != 58;) {
            if (c >= 65 && c <= 90) {
                n += (c - 65) * m;
                tuple[tupleIndex++] = n;
                if (tupleIndex == len) {
                    out.push(tuple);
                    tuple = [];
                    tupleIndex = 0;
                }
                n = 0;
                m = 1;
            } else {
                n += (c - 97) * m;
                m *= 26;
            }
        }
        return i;
    }

    function unpack(data) {
        // const start = Date.now();
        const tileEnum = [];
        let i = unpackTuples(data, 0, 3, tileEnum);
        const tilePack = [];
        i = unpackTuples(data, i, 2, tilePack);
        const visArray = Uint8Array.from(atob(data.substr(i)).split('').map(c => c.charCodeAt(0)));
        const tiles = [];
        let visIndex = 0;
        let visBit = 0;
        let visValue;
        for (const tuple of tilePack) {
            const tileIndex = tuple[0];
            let count = tuple[1];
            const [tileId, tileSubtype, tileStatus] = tileEnum[tileIndex];
            const pre = tileId + ',' + tileStatus + ',0,' + tileSubtype + ',';
            while (count-- > 0) {
                if (visBit == 0) visValue = visArray[visIndex++];
                tiles.push(pre + ((visValue & 1) ? '1' : '0'));
                visValue >>= 1;
                visBit = (visBit + 1) % 8;
            }
        }
        const output = tiles.join(';');
        // const end = Date.now();
        // console.log(`${data.length} -> ${output.length} in ${end - start}ms`);
        return output;
    }

    return { pack, unpack };
})();