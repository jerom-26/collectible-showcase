# Collectible Showcase

A 3D web showroom I built for displaying my Hot Wheels NFTs on WAX.

Instead of viewing the collection as a normal wallet grid or list, the idea was to make it feel more like an actual collection with each collectible displayed inside a 3D room.

<img width="1895" height="912" alt="image" src="https://github.com/user-attachments/assets/1d2e805c-39ee-4598-915d-071b54fb6622" />

## Live Demo

https://collectible-showcase.itsjj.workers.dev/

## What it does

- Enter a public WAX account name
- Loads supported Hot Wheels NFTs from that account
- Displays the collection inside a 3D showroom
- Shows NFT artwork and its video and metadata
- Switch between collectibles from the quick-select bar
- View mint number, rarity, collection, set and other metadata
- Move around the showroom and inspect the collection

There is no wallet connection required.

The app only performs a public blockchain collection lookup and does not prove wallet ownership.

## Why I built it

I own a few Hot Wheels NFTs and wanted something better than opening a wallet and looking at them as thumbnails in a list.

The main idea was simple:

> Make a digital collection feel more like an actual collection.

This project was also an experiment with combining blockchain data, NFT media and an interactive 3D web experience.

## Tech Stack

- React
- TypeScript
- Three.js
- Next.js
- WAX / AtomicAssets data
- Cloudflare Workers

## How it works

```text
WAX account
     ↓
Load supported NFT assets
     ↓
Read metadata + media
     ↓
Build collection
     ↓
Display assets inside the Three.js showroom
