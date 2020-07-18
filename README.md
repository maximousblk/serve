# serve

A neat interface for directory listing and fileserving over http

[![nest badge](https://nest.land/badge-large.svg)](https://nest.land/package/serve)


## Usage

The quickest way to get started is to just run the following command in your project's directory.

> You'll need at least [Deno 1.2.0](https://github.com/denoland/deno/releases/tag/v1.2.0)

```sh
deno run --allow-read --allow-net x.nest.land/serve@1.0.0/mod.ts
```

If you prefer, you can also install `serve` globally using `deno install`:

```sh
deno install --allow-read --allow-net -n serve x.nest.land/serve@1.0.0/mod.ts
```

Once that's done, you can run this command inside your project's directory...

```sh
serve
```

...or specify which folder you want to serve:

```sh
serve folder_name
```

Finally, run this command to see a list of all available options:

```sh
serve --help
```

:tada: Now you understand how `serve` works!

## Credits

This project is inspire by [vercel/serve](https://github.com/vercel/serve) and [Deno's file_server demo](https://deno.land/std/http#file-server)

## License

`serve` is distributed under [The MIT License](LICENSE).
