# shacl-jsonschema-converter
  

## Description

This is a simple library (in development) to convert SHACL TTL files into json schema.

## Use

```bash
$ const { getSchemasFromTtl } = require('shacl-jsonschema-converter');

$ const jsonSchema = getSchemasFromTtl('ttl-file-as-string');
$ # OR
$ const jsonSchema = getUniqueSchemaFromTtl('ttl-file-as-string');
```
