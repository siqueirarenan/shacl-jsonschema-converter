# shacl-jsonschema-converter
  

## Description

This is a simple library to convert SHACL TTL files into json schema.

## Use

### getSchemasFromTtl

Use this function if from each TTL-file you want to retrieve a list of schemas, one for each model defined in the file. All references to other models will be converted to `$ref`.

```bash
$ const { getSchemasFromTtl } = require('shacl-jsonschema-converter');

$ const jsonSchema = getSchemasFromTtl('ttl-file-as-string');
```

### getUniqueSchemaFromTtl

Use this function if from each TTL-file you want to retrieve only one schema. The first model in the file will be treated as the main schema and all the secondary models will be sub-schemas. Only the references to models that are not found in the secondary schemas will remain as `$ref`.

```bash
$ const { getUniqueSchemaFromTtl } = require('shacl-jsonschema-converter');

$ const jsonSchema = getUniqueSchemaFromTtl('ttl-file-as-string');
```