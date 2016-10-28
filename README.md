# PantaRei

Build Modern App using Web Standards

## Getting started

### Define a Web Component

In `hello-web.html`

```html
<template-element id="hello-web">
  <template>
    <h1>Hello <em>{{name}}</em>!</h1>
  </template>
</template-element>

<script>
  class HelloWeb extends Pantarei.Element {

    get name () {
      return 'Pantarei!'
    }

  }

  document.registerElement('hello-web', HelloWeb)
</script>
```

### Use a Web Component

In `index.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>Pantarei</title>
  <script src="path/to/pantarei.js"></script>
  <link rel="import" href="path/to/hello-web.html">
</head>
<body>

  <hello-web></hello-web>

</body>
</html>
```

## Examples

- [TodoList App](http://pantareijs.github.io/pantarei-app-todos)

## License

MIT