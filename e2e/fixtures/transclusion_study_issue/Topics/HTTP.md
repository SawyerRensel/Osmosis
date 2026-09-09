---
osmosis-cards: true
osmosis-deck: Full Stack Engineering/Overview/Internet & Web Development
---

# HTTP ^os-33vmrb

- The standard for data transfer between clients and servers ^os-3llavn

```osmosis
id: os-83y7d4
What does HTTP stand for?
***
Hypertext Transfer Protocol
```

## Requests ^os-gl9oc4

- GET ^os-go5ef5
	- retrieve info from server ^os-wp4uhh
	- Loading *one* webpage can result in *multiple* GET requests ^os-yinunv
	- When user types URL and presses `Enter`  ![html_css_js|199](../../media/html_css_js.webp) ^os-g0h433
		1. Server processes request ^os-a5d96h
		2. Sends [HTML](HTML.md) back to client  ^os-neisv8
		3. Browser searches for other external resources ^os-91d04t
			- Requests the [CSS](CSS.md) ^os-o1njat
				- Analyzes the CSS  ^os-w47w07
				- Applies visual styles to content ^os-dc3w3d
			- Media assets, which may delay page loading ^os-lbaoxm
				- Images ^os-jvcli1
				- Videos ^os-98a4um
				- etc. ^os-255tvx
			- [Javascript](Javascript.md) ^os-wvas1l
- POST ^os-4gimfp
	- send data to server ^os-xtb5e1
		- customer info ^os-19m9lc
		- file upload ^os-jwniip
		- etc. ^os-q7j2zj
- PUT ^os-ji7ka0
	- replace current data with uploaded content ^os-blzlpd
- DELETE ^os-zyj9u0
	- remove current data ^os-sh01fq

## Status Codes  ^os-gwbkdv

- Sent by server to client ^os-1nmd1d
	- help client know how to handle data ^os-f5pcxl
- Indicate if HTTP request was successful ^os-promrv

### Common codes ^os-29apjp

```osmosis
id: 5313d916
bidi: true
200 OK
***
The request has succeeded
```

```osmosis
id: 5d67fc64
bidi: true
301 Moved Permanently
***
The resources has been moved and the client is being redirected
```

```osmosis
id: b5bd3eae
bidi: true
404 Not Found
***
The requested resource was not found.
```

```osmosis
id: 5b9f16d7
bidi:true
500 Internal Server Error
***
The server encountered an unexpected error.
```
