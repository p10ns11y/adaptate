import { z } from 'zod';
import { checkModel } from '../check-model';

describe('checkModel function', () => {
  it('should correctly apply required properties as per the config', () => {
    // Create a Zod schema where all properties are optional
    const schema = z.object({
      name: z.string().optional(),
      age: z.number().optional(),
      address: z
        .object({
          street: z.string().optional(),
          city: z.string().optional(),
        })
        .optional(),
    });

    // Config specifying which properties are required
    const config = {
      requiredProperties: {
        name: true,
        'address.city': true,
      },
    };

    // Perform the check
    checkModel(schema, config);

    // Validate instances to verify the required properties are enforced
    const validData = {
      name: 'John Doe',
      address: { city: 'New York' },
    };
    const invalidDataMissingName = {
      address: { city: 'New York' },
    };
    const invalidDataMissingCity = {
      name: 'John Doe',
      address: {},
    };

    expect(() => schema.parse(validData)).not.toThrow(); // Should pass
    expect(() => schema.parse(invalidDataMissingName)).toThrow(); // Should fail due to missing 'name'
    expect(() => schema.parse(invalidDataMissingCity)).toThrow(); // Should fail due to missing 'address.city'
  });
});
