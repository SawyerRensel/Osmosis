# CSS Selectors

## Specificity determines which rules override each other
- Type selectors
	- Match by element name
		- like `p` or `h1`
		- `h5 { color: yellow; }` styles every level-five heading on the page
	- Universal (Most general)
		- `*` matches every element
		- Grouped with others
			- like `* + p`
			- like `* > li`
- Attribute selectors
	- Exact match
		- like `[href]` or `a[target]`
		- like `img[src]`
	- Partial match
		- `type[attribute*=value]`
		- like `a[href^="https"]`
		- Case flags
			- like `[lang|=en i]`
			- like `[class~=main-title s]`
	- Where they help
		- meant to be reused over many elements
- Class selectors
	- Reusable names
		- `.author-class { color: pink; }`
		- meant to be reused over many elements, as many times as you like
	- Combined classes
		- `.card.wide` needs both
		- Chained with types
			- like `p.note`
			- like `li.done`
		- ```css
		  .recipe-card {
		    display: grid;
		    gap: 1rem;
		    padding: 1rem 1.5rem;
		    border: 1px solid #ccc;
		    border-radius: 8px;
		  }
		  .recipe-card h2 {
		    font-size: 1.25rem;
		    margin: 0;
		  }
		  .recipe-card .steps {
		    counter-reset: step;
		  }
		  ```
- Pseudo-class selectors
	- User action
		- like `:active` or `:focused`
		- like `:hover`
	- Position
		- like `:first-child`
		- like `:nth-child(2n + 1)`
- ID selectors (Most specific)
	- One per page
		- like `#header`
		- `author-id { color: teal; }` is meant to override classes
	- Rarely needed
		- Prefer classes
			- like `#main` only once
			- meant to override everything else

## Points to HTML element you want to style
- Selector
- Declaration block
	- Property
	- Value

## Combinators
- Descendant
- Child
	- like `ul > li`
- Sibling

## Cascade order
- Origin
- Specificity
- Source order

## Inheritance
- Inherited properties
	- like `color`
- Non-inherited properties

## Units
- Absolute
- Relative
	- like `rem` and `em`
