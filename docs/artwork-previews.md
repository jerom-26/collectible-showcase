# Artwork previews

The collection API uses `lib/nft-posters.json` to map a video URL to a small,
same-origin JPEG in `public/nft-posters`. The mapping applies to every mint and
account using that video, rather than to a specific wallet. The initial set
covers the seven videos reported in `passionfruti`.

To add previews for another account, install FFmpeg and run:

```sh
npm run media:posters -- accountname
```

Set `FFMPEG_PATH` if FFmpeg is not on PATH. An optional second argument specifies
the origin of a running showcase API. Review the generated images, run
`npm run test:media`, and deploy the images and manifest together. The script
uses the API's first page (up to 24 collectibles), downloads source videos to
the ignored `work/poster-videos` directory, and extracts 640px JPEG previews.
Existing previews are reused. FFmpeg is an authoring tool, not a production
dependency.

Videos not yet in the manifest still work: the browser captures their first
decoded frame, stops static thumbnail video transfers, and caches up to 24
generated previews for the current browser tab's session. A first visit to
unprepared artwork still depends on the external media gateway. Only the
featured NFT continues playing. Image and video request deadlines release
stalled queue slots after 15 and 20 seconds respectively.
