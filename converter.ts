type SchemaOptions = {
  /**base path to be included on $ref fields */
  basePath?: string;
  /**properties to ignore */
  excludeProperties?: string[];
  /**use logger*/
  log?: boolean;
};

  /**Transform each model a TTL in a separate schema and return a list with all the schemas.
   * All sub-models are referenced with $ref */
  export function getSchemasFromTtl(validTtlFile: string, options?: SchemaOptions) {
    const schemas = [];

    const fileText = removeExtraSpacesAndLinebreaks(validTtlFile);

    const models = getListOfDotSeparatedModels(fileText);

    const prefixes = getPrefixes(models);

    models.forEach(model => {
      model = model.trim();
      if (model.startsWith('@prefix')) return;

      model = replacePrefixes(model, prefixes);

      const label = getLabel(model);
      const title = getShapeName(model);
      validateIfTypeIsIgnored(model, `${label}- ${title}`);

      const modelSchema = {
        id: label,
        title: title,
        type: 'object',
        required: [],
        properties: {},
        additionalProperties: model.includes('<http://www.w3.org/ns/shacl#closed> true') ? false : true,
      };

      addPropertiesToSchema(model, options, modelSchema);

      schemas.push(modelSchema);
    });

    if (options?.log) console.log(`Successfully loaded models: ${schemas.map(s => s.id).join(', ')}`);

    return schemas;
  }

  /**Transform a TTL in one unique schema. The first model is the main one, and all the sub-models schemas
   * are added directly to the corresponding property, instead of referencing them with $ref (if found in the same TTL) */
  export function getUniqueSchemaFromTtl(validTtlFile: string, options?: SchemaOptions) {
    const schemas = getSchemasFromTtl(validTtlFile, options);
    const mainSchema = schemas[0];

    Object.keys(mainSchema.properties).forEach(prop => {
      const propRef = mainSchema.properties[prop].$ref?.replace(options?.basePath ?? '', '');
      const itemRef = (mainSchema.properties[prop].items)?.$ref?.replace(options?.basePath ?? '', '');

      if (propRef) {
        mainSchema.properties[prop] = schemas.find(s => s.id == propRef) ?? mainSchema.properties[prop];
      } else if (itemRef) {
        mainSchema.properties[prop].items = schemas.find(s => s.id == itemRef) ?? mainSchema.properties[prop].items;
      } else {
        return;
      }
    });

    return mainSchema;
  }

  // ---------------- Helper Functions ----------------------

  function replacePrefixes(model: string, prefixes: object) {
    let words = model.replace(/\[/g, '[ ').split(' ');
    Object.keys(prefixes).forEach(prefix => {
      words = words.map(word => (word.includes(`${prefix}:`) ? `<${word.replace(`${prefix}:`, prefixes[prefix])}>` : word));
    });
    return words.join(' ').replace(/\[ /g, '[');
  }

  function getPrefixes(models: string[]) {
    const prefixes = {};
    models.forEach(model => {
      model = model.trim();
      if (!model.startsWith('@prefix')) return;

      const prefix = model.replace('@prefix ', '').split(':');
      prefixes[prefix[0].trim()] = prefix.slice(1).join(':').replace('<', '').replace('>', '').trim();
    });
    return prefixes;
  }

  function addPropertiesToSchema(model: string, options: SchemaOptions, schema: any) {
    model.split('<http://www.w3.org/ns/shacl#property>').forEach(propLine => {
      propLine = propLine.trim();

      if (!propLine.startsWith('[')) return;

      const { propName, propSchema, isRequired } = parseProperties(propLine, options);

      schema.properties[propName] = propSchema;
      if (isRequired) (schema.required as string[]).push(propName);
    });

    options?.excludeProperties.forEach(prop => delete schema.properties[prop]);
  }
  function parseProperties(
    propLine: string,
    options: SchemaOptions,
  ): { propName: string; propSchema: any; isRequired: boolean } {
    const propSchema: any = {};
    let propName: string;
    let isRequired = false;
    let isArray = true;

    getListOfSemiColonSeparatedProperties(propLine).forEach(x => {
      const keyValue = x.trim().split(' ');
      const key = keyValue[0];
      let value = keyValue.slice(1).join(' ');

      switch (key) {
        case '<http://www.w3.org/ns/shacl#path>':
          value = value.replace('<', '').replace('>', '');
          propName = value.includes('#') ? value.split('#')[1] : value.split('/').slice(-1)[0];
          break;
        case '<http://www.w3.org/ns/shacl#name>':
          propSchema.title = value.substring(1, value.length - 1);
          break;
        case '<http://www.w3.org/ns/shacl#datatype>':
          propSchema.type = convertDatatype(value);
          break;
        case '<http://www.w3.org/ns/shacl#description>':
          propSchema.description = value.substring(1, value.length - 1);
          break;
        case '<http://www.w3.org/ns/shacl#maxExclusive>':
          propSchema.exclusiveMaximum = parseFloat(value.replace(/\"/, ''));
          break;
        case '<http://www.w3.org/ns/shacl#maxInclusive>':
          propSchema.maximum = parseFloat(value.replace(/\"/, ''));
          break;
        case '<http://www.w3.org/ns/shacl#minInclusive>':
          propSchema.minimum = parseFloat(value.replace(/\"/, ''));
          break;
        case '<http://www.w3.org/ns/shacl#minExclusive>':
          propSchema.exclusiveMinimum = parseFloat(value.replace(/\"/, ''));
          break;
        case '<http://www.w3.org/ns/shacl#maxLength>':
          propSchema.maxLength = parseFloat(value.replace(/\"/, ''));
          break;
        case '<http://www.w3.org/ns/shacl#minLength>':
          propSchema.minLength = parseFloat(value.replace(/\"/, ''));
          break;
        case '<http://www.w3.org/ns/shacl#pattern>':
          propSchema.pattern = value
            .substring(1, value.length - 1)
            .replace(/\\\\/g, '\\')
            .replace(/\\\\/g, '\\');
          break;
        case '<http://www.w3.org/ns/shacl#in>':
          value = value.trim();
          value = value.substring(1, value.length - 1);
          value = value.trim();
          value = value.substring(1, value.length - 1);
          propSchema.enum = value.replace('""', '" "').split('" "');
          propSchema.type = 'string';
          break;
        case '<http://www.w3.org/ns/shacl#minCount>':
          const minCount = parseInt(value.replace(/\"/, ''));
          if (minCount > 0) isRequired = true;
          if (minCount > 0) propSchema.minItems = minCount;
          break;
        case '<http://www.w3.org/ns/shacl#maxCount>':
          const maxCount = parseInt(value.replace(/\"/, ''));
          if (maxCount == 1) isArray = false;
          if (isArray) propSchema.maxItems = maxCount;
          break;
        case '<http://www.w3.org/ns/shacl#node>':
          propSchema.type = 'object';
          propSchema.$ref = (options?.basePath ? options.basePath : '') + getLabel(value);
          break;
      }
    });

    if (options && options.excludeProperties.includes(propName)) isRequired = false;

    if (isArray) {
      propSchema.items = { ...propSchema };
      propSchema.type = 'array';
      delete propSchema.items.maxItems;
      delete propSchema.items.minItems;
      delete propSchema.items.description;
      delete propSchema.$ref;
    } else {
      delete propSchema.minItems;
      delete propSchema.maxItems;
    }

    if (!propName) throw { message: `Model has no path and property name could not be defined: ${propLine}` };

    return { propName, propSchema, isRequired };
  }
  function convertDatatype(value: string): string {
    switch (value) {
      case '<http://www.w3.org/2001/XMLSchema#string>':
        return 'string';
      case '<http://www.w3.org/2001/XMLSchema#dateTime>':
        return 'string';
      case '<http://www.w3.org/2001/XMLSchema#anyURI>':
        return 'string';
      case '<http://www.w3.org/2001/XMLSchema#double>':
        return 'number';
      case '<http://www.w3.org/2001/XMLSchema#integer>':
        return 'integer';
      case '<http://www.w3.org/2001/XMLSchema#boolean>':
        return 'boolean';
      default:
        throw { message: 'Invalid data type ' + value.toString() };
    }
  }

  function getListOfDotSeparatedModels(fileText: string) {
    const letters = [];
    let isInString = false;
    let isInBracks = false;
    const isNotInFloat = (j: number) => parseInt(fileText.charAt(j + 1)).toString() == 'NaN';
    for (let i = 0; i < fileText.length; i++) {
      let char = fileText.charAt(i);
      if (char == '"') isInString = !isInString;
      if (char == '<') isInBracks = true;
      if (char == '>') isInBracks = false;
      if (char == '.' && !isInString && !isInBracks && isNotInFloat(i)) char = '::MODULES_SEPARATOR::';
      letters.push(char);
    }
    const models = letters.join('').split('::MODULES_SEPARATOR::').slice(0, -1);
    return models;
  }

  function getListOfSemiColonSeparatedProperties(propLine: string) {
    propLine = propLine.substring(1, propLine.length - 2);
    const letters = [];
    let isInString = false;
    for (let i = 0; i < propLine.length; i++) {
      let char = propLine.charAt(i);
      if (char == '"') isInString = !isInString;
      if (char == ';' && !isInString) char = '::PROP_SEPARATOR::';
      letters.push(char);
    }
    return letters.join('').split('::PROP_SEPARATOR::').slice(0, -1);
  }

  function removeExtraSpacesAndLinebreaks(turtle: string) {
    const letters = [];
    let isInString = false;
    for (let i = 0; i < turtle.length; i++) {
      let char = turtle.charAt(i);
      if (char == '"') isInString = !isInString;
      if (char == ';' && !isInString) char = '::SEMICOLON_SEPARATOR::';
      letters.push(char);
    }

    return letters
      .join('')
      .replace(/::SEMICOLON_SEPARATOR::/g, ' ; ')
      .replace(/((#)(?=(?:[^">]|"[^"]*")*$)).*/gm, '') //Remove comments
      .replace(/\r?\n/g, '') //Remove line breaks
      .replace(/ +(?= )/g, '') //Remove multiple spaces
      .replace(/\t/g, '') //Remove tabs
      .trim();
  }

  function getLabel(modelString: string): string {
    const fullName = modelString.split(' ')[0].replace('<', '').replace('>', '');
    let labelName = fullName.includes('#') ? fullName.split('#')[1] : fullName.split('/').slice(-1)[0];
    labelName = labelName.endsWith('Shape') ? labelName.substring(0, labelName.length - 5) : labelName;
    return labelName.charAt(0).toLowerCase() + labelName.slice(1);
  }

  function getShapeName(modelString: string): string {
    const model = modelString.split(';');
    try {
      const fullName = model
        .find(x => x.trim().startsWith('<http://www.w3.org/ns/shacl#targetClass>'))
        .trim()
        .split(' ')[1]
        .trim();
      return fullName.startsWith('<')
        ? (fullName.includes('#') ? fullName.split('#')[1] : fullName.split('/').slice(-1)[0]).replace('>', '')
        : fullName;
    } catch {
        throw { message: 'targetClass is required in model' };
    }
  }

  function validateIfTypeIsIgnored(modelString: string, label: string): void {
    try {
      const ignoresType = modelString
        .split(';')
        .find(x => x.trim().startsWith('<http://www.w3.org/ns/shacl#ignoredProperties>'))
        .trim()
        .split(' ')
        .find(x => x == '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>');
      if (!ignoresType) throw {};
    } catch {
        throw { message: 'redf:type must be ignored' };
    }
  }
  