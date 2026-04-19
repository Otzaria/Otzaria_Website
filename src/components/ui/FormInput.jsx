'use client'

/**
 * Reusable form input component with label and error display
 * @param {Object} props
 * @param {string} [props.label] - Input label
 * @param {string} [props.type] - Input type (text, password, email, etc.)
 * @param {string} [props.value] - Input value
 * @param {Function} [props.onChange] - Change handler
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.error] - Error message
 * @param {boolean} [props.required] - Mark as required
 * @param {string} [props.icon] - Material icon to show
 */
export default function FormInput({
  label,
  type = 'text',
  value,
  onChange,
  placeholder = '',
  error = '',
  required = false,
  icon,
  disabled = false,
  ...rest
}) {
  return (
    <div>
      {label && (
        <label className="block text-sm font-medium text-gray-900 mb-2">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
      )}
      
      <div className="relative">
        {icon && (
          <span className="absolute right-3 top-3 material-symbols-outlined text-gray-400">
            {icon}
          </span>
        )}
        
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-colors ${
            icon ? 'pr-10' : ''
          } ${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'} ${
            disabled ? 'bg-gray-100 cursor-not-allowed' : ''
          }`}
          {...rest}
        />
      </div>

      {error && (
        <p className="text-red-600 text-sm mt-1">{error}</p>
      )}
    </div>
  )
}
