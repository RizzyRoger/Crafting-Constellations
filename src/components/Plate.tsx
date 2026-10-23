import { Link } from 'react-router-dom'

// The name, lettered like a pigment name in a ruled box. Not a logo.
export const Plate = ({ as = 'p', link = false }: { as?: 'h1' | 'p'; link?: boolean }) => {
  const Name = as
  const name = <Name className="plate__name pencil ruled">Crafting Constellations</Name>
  return (
    <div className="plate">
      {link ? (
        <Link to="/" style={{ textDecoration: 'none' }} aria-label="Crafting Constellations, home">
          {name}
        </Link>
      ) : (
        name
      )}
    </div>
  )
}
