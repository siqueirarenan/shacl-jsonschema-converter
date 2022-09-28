import { getSchemasFromTtl, getUniqueSchemaFromTtl } from './converter';
import {describe, expect} from '@jest/globals';

//These service does not validate validity of the Shacl model. Input string bust be always valid
const validTtlFile = `  @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix dash: <http://datashapes.org/dash#> .
@prefix   xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix sh:  <http://www.w3.org/ns/shacl#> .

@prefix ex: <http://example.org/path/>   .


ex:TestShape a sh:NodeShape;
  sh:targetClass ex:TestSchema;
	sh:ignoredProperties ( rdf:type ) ;			# remove Constraint Violation due to Model being owl:Class and not rdf:Class
  sh:closed true;
  ex:unknown "unknown wrong value should be ignored";
  sh:property [
    sh:path ex:stringProp;
    sh:datatype xsd:string;
    sh:name "string property";
    sh:description "descr1. 123";
    sh:minCount 1; sh:maxCount 1;
  ] ;
  sh:property  [
    sh:maxCount  1;
    sh:datatype xsd:boolean;
    sh:path ex:boolProp;
    sh:description "descr2";
  ];
  sh:property [
    sh:path ex:objectProp;
    sh:node ex:objectPropShape;
    sh:maxCount   1;
  ];

  sh:property [
    sh:node ex:objectPropShape;
    sh:description "array descr";
    sh:path ex:objArrayProp;
    sh:minCount 1;
  ];
  sh:property [
    sh:path ex:strArrayProp;
    sh:datatype xsd:string;
    sh:maxCount 10;
    sh:description "array descr";
  ];
  sh:property [
    sh:path ex:dateProp;
    sh:datatype xsd:dateTime;
    sh:maxCount 1;
  ];
  sh:property [
    sh:path ex:numberProp;
    sh:datatype xsd:double;
    sh:maxExclusive 2;
    sh:minInclusive 3;
    sh:minExclusive 4;
    sh:maxInclusive 5;
    sh:maxCount 1;
  ];
  sh:property [
    sh:path ex:patternProp;
    sh:datatype xsd:string;
    sh:maxLength 10;
    sh:minLength 5;
    sh:pattern "[0-9]{7}";
    sh:maxCount 1;
  ];
  sh:property [
    sh:path ex:enumProp;
    sh:datatype xsd:string;
    sh:in ("e1""e2"  "e3");
    sh:maxCount  1;
  ].

ex:objectPropShape a sh:NodeShape;
  sh:targetClass ex:objectPropSchema;
  sh:ignoredProperties ( rdf:type ) ;
  sh:property [
    sh:path ex:prop;
    sh:datatype xsd:string;
    sh:maxCount 1;
  ] .
`;

let expectedSchema;

beforeEach(async () => {
  expectedSchema = {
    id: 'Test',
    title: 'TestSchema',
    type: 'object',
    additionalProperties: false,
    required: ['stringProp', 'objArrayProp'],
    properties: {
      stringProp: {
        description: 'descr1. 123',
        type: 'string',
        title: 'string property',
      },
      boolProp: {
        description: 'descr2',
        type: 'boolean',
      },
      objectProp: {
        type: 'object',
        $ref: 'objectProp',
      },
      objArrayProp: {
        description: 'array descr',
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          $ref: 'objectProp',
        },
      },
      strArrayProp: {
        maxItems: 10,
        description: 'array descr',
        type: 'array',
        items: {
          type: 'string',
        },
      },
      dateProp: {
        type: 'string',
      },
      numberProp: {
        type: 'number',
        maximum: 5,
        exclusiveMaximum: 2,
        minimum: 3,
        exclusiveMinimum: 4,
      },
      patternProp: {
        type: 'string',
        maxLength: 10,
        minLength: 5,
        pattern: '[0-9]{7}',
      },
      enumProp: {
        type: 'string',
        enum: ['e1', 'e2', 'e3'],
      },
    },
  };
});

describe('SHACL to list of schemas', () => {
  it('should successfully convert a valid shacl to json-schema', async () => {
    const actual = getSchemasFromTtl(validTtlFile);

    expect(actual[0]).toEqual(expectedSchema);
    expect(actual[1]).toEqual({
      id: 'objectProp',
      title: 'objectPropSchema',
      type: 'object',
      required: [],
      properties: {
        prop: {
          type: 'string',
        },
      },
      additionalProperties: true,
    });
  });

  it('should successfully convert a valid shacl to json-schema with options', async () => {
    const actual = getSchemasFromTtl(validTtlFile, {
      basePath: 'basepath#',
      excludeProperties: ['stringProp', 'numberProp'],
    });
    const expected = { ...expectedSchema };
    delete expected.properties['stringProp'];
    delete expected.properties['numberProp'];
    expected.required = ['objArrayProp'];
    (expected.properties['objArrayProp'].items).$ref =
      'basepath#' + (expected.properties['objArrayProp'].items).$ref;
    (expected.properties['objectProp']).$ref = 'basepath#' + (expected.properties['objectProp']).$ref;

    expect(actual[0]).toEqual(expected);
  });

  it('should throw error if targetClass is missing', async () => {
    try {
      getSchemasFromTtl(`
      @prefix sh:  <http://www.w3.org/ns/shacl#> . 
      @prefix aa:  <http://www.w3.org/ns/shacl#test> .
      @prefix xx:  <http://www.w3.org/2001/XMLSchema#> .
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      sh:TestShape a sh:NodeShape;
      sh:ignoredProperties ( rdf:type ) ;
      sh:closed true;
      sh:property [
        sh:path sh:aPath;
        sh:description "A text";
        sh:maxCount 1;
      ].`);
    } catch (e) {
      expect(e.message).toContain('targetClass');
    }
  });

  it('should throw error if a property path is missing path', async () => {
    try {
      getSchemasFromTtl(`@prefix ex: <some#>. 
      @prefix sh: <http://www.w3.org/ns/shacl#>. 
      @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      ex:TestShape a sh:NodeShape;
      sh:targetClass ex:TestSchema;
      sh:ignoredProperties ( rdf:type ) ;
      sh:closed true;
      sh:property [
        sh:datatype xsd:string;
        sh:maxCount 1;
      ].`);
    } catch (e) {
      expect(e.message).toContain('no path and property name');
    }
  });

  it('should throw error if a property has non recognized datatype', async () => {
    try {
      getSchemasFromTtl(`@prefix ex: <some#>. @prefix sh: <http://www.w3.org/ns/shacl#>. 
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      ex:TestShape a sh:NodeShape;
      sh:targetClass ex:TestSchema;
      sh:ignoredProperties ( rdf:type ) ;
      sh:closed true;
      sh:property [
        sh:path sh:aPath;
        sh:datatype ex:wrong;
        sh:maxCount 1;
      ].`);
    } catch (e) {
      expect(e.message).toContain('Invalid data type');
    }
  });

  it('should accept different prefix specifications and targetClass without prefix', async () => {
    const actual = getSchemasFromTtl(`
      @prefix other:  <http://www.w3.org/ns/shacl#> .
      @prefix xx:  <http://www.w3.org/2001/XMLSchema#> . 
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      other:TestShape a other:NodeShape;
      other:targetClass TestSchema;
      other:ignoredProperties ( rdf:type ) ;
      other:closed true;
      other:property [
        other:path other:aPath;
        other:datatype xx:string;
        other:maxCount 1;
      ].`);
    expect(actual[0]).toEqual({
      additionalProperties: false,
      id: 'Test',
      properties: { aPath: { type: 'string' } },
      required: [],
      title: 'TestSchema',
      type: 'object',
    });
  });

  it('should accept node name without Shape at the end and use it for the id', async () => {
    const actual = getSchemasFromTtl(`
      @prefix other:  <http://www.w3.org/ns/shacl#> .
      @prefix xx:  <http://www.w3.org/2001/XMLSchema#> . 
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      other:TestShapeWordNotIncluded a other:NodeShape;
      other:targetClass TestSchema;
      other:ignoredProperties ( rdf:type ) ;
      other:closed true;
      other:property [
        other:path other:aPath;
        other:datatype xx:string;
        other:maxCount 1;
      ].`);
    expect(actual[0]).toEqual({
      additionalProperties: false,
      id: 'TestShapeWordNotIncluded',
      properties: { aPath: { type: 'string' } },
      required: [],
      title: 'TestSchema',
      type: 'object',
    });
  });

  it('should allow comments and undefined datatype', async () => {
    const actual = getSchemasFromTtl(`
      @prefix other:  <http://www.w3.org/ns/shacl#> . 
      @prefix aa:  <http://www.w3.org/ns/shacl#test> . #comments
      @prefix xx:  <http://www.w3.org/2001/XMLSchema#> . #comments
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      other:TestShape a other:NodeShape;
      other:targetClass TestSchema; #comments bla bla b#la other:sfadfa
      other:ignoredProperties ( rdf:type ) ;
      other:closed true;
      other:property [
        other:path other:aPath;  #comments bla bla bla other:sfadfa
        other:description "A text with # and # and ##";  #comments bla bla bla other:sfadfa
        other:maxCount 1;
      ].`);
    expect(actual[0]).toEqual({
      additionalProperties: false,
      id: 'Test',
      properties: { aPath: { type: undefined, description: 'A text with # and # and ##' } },
      required: [],
      title: 'TestSchema',
      type: 'object',
    });
  });

  it('should accept anyURI datatype and interpratete it as string', async () => {
    const actual = getSchemasFromTtl(`
      @prefix sh:  <http://www.w3.org/ns/shacl#> . 
      @prefix aa:  <http://www.w3.org/ns/shacl#test> .
      @prefix xx:  <http://www.w3.org/2001/XMLSchema#> .
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      sh:TestShape a sh:NodeShape;
      sh:targetClass TestSchema;
      sh:ignoredProperties ( rdf:type ) ;
      sh:closed true;
      sh:property [
        sh:path sh:aPath;
        sh:description "A text";
        sh:datatype xx:anyURI;
        sh:maxCount 1;
      ].`);
    expect(actual[0]).toEqual({
      additionalProperties: false,
      id: 'Test',
      properties: { aPath: { type: 'string', description: 'A text' } },
      required: [],
      title: 'TestSchema',
      type: 'object',
    });
  });

  it('should accept float number as param', async () => {
    const actual = getSchemasFromTtl(`
      @prefix sh:  <http://www.w3.org/ns/shacl#> . 
      @prefix aa:  <http://www.w3.org/ns/shacl#test> .
      @prefix xx:  <http://www.w3.org/2001/XMLSchema#> .
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      sh:TestShape a sh:NodeShape;
      sh:targetClass TestSchema;
      sh:ignoredProperties ( rdf:type ) ;
      sh:closed true;
      sh:property [
        sh:path sh:aPath;
        sh:description "A text";
        sh:maxCount 1;
        sh:maxInclusive 5.3;
        sh:datatype xx:double;
      ].`);
    expect(actual[0]).toEqual({
      additionalProperties: false,
      id: 'Test',
      properties: { aPath: { type: 'number', description: 'A text', maximum: 5.3 } },
      required: [],
      title: 'TestSchema',
      type: 'object',
    });
  });

  it('should throw error if a ignoredProperties ( rdf:type ) is missing (otherwise validation throws error)', async () => {
    try {
      getSchemasFromTtl(`
      @prefix other:  <http://www.w3.org/ns/shacl#> .
      @prefix xx:  <http://www.w3.org/2001/XMLSchema#> . 
      @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
      other:TestShapeWordNotIncluded a other:NodeShape;
      other:targetClass TestSchema;
      other:closed true;
      other:property [
        other:path other:aPath;
        other:datatype xx:string;
        other:maxCount 1;
      ].`);
    } catch (e) {
      expect(e.message).toContain('redf:type must be ignored');
    }
  });
});

describe('SHACL to one unique schema', () => {
  it('should successfully convert a valid shacl to unique json-schema, including sub models', async () => {
    const actual = getUniqueSchemaFromTtl(validTtlFile);

    const subschema = {
      id: 'objectProp',
      title: 'objectPropSchema',
      type: 'object',
      required: [],
      properties: {
        prop: {
          type: 'string',
        },
      },
      additionalProperties: true,
    };

    expectedSchema.properties.objectProp = subschema;
    expectedSchema.properties.objArrayProp.items = subschema;

    expect(actual).toEqual(expectedSchema);
  });

  it('should successfully convert a valid shacl to unique json-schema, with refs to not found submodels', async () => {
    const actual = getUniqueSchemaFromTtl(`
    @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
    @prefix sh:  <http://www.w3.org/ns/shacl#> .
    @prefix ex: <http://example.org/path/>   .
    
    ex:TestShape a sh:NodeShape;
      sh:targetClass ex:TestSchema;
      sh:ignoredProperties ( rdf:type ) ;
      sh:closed true;
      sh:property [
        sh:path ex:objectProp;
        sh:node ex:objectPropShape;
        sh:maxCount 1;
      ].
    `);

    expect(actual).toEqual({
      id: 'Test',
      title: 'TestSchema',
      type: 'object',
      additionalProperties: false,
      required: [],
      properties: {
        objectProp: {
          type: 'object',
          $ref: 'objectProp',
        },
      },
    });
  });
});
