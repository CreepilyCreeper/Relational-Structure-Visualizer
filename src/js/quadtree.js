class Quadtree {
    constructor(boundary, capacity = 8) {
        this.boundary = boundary; // {x, z, w, h}
        this.capacity = capacity;
        this.points = [];
        this.divided = false;
    }
    subdivide() {
        const { x, z, w, h } = this.boundary;
        this.nw = new Quadtree({ x: x - w/2, z: z - h/2, w: w/2, h: h/2 }, this.capacity);
        this.ne = new Quadtree({ x: x + w/2, z: z - h/2, w: w/2, h: h/2 }, this.capacity);
        this.sw = new Quadtree({ x: x - w/2, z: z + h/2, w: w/2, h: h/2 }, this.capacity);
        this.se = new Quadtree({ x: x + w/2, z: z + h/2, w: w/2, h: h/2 }, this.capacity);
        this.divided = true;
    }
    insert(node) {
        const { x, z, w, h } = this.boundary;
        if (
            node.position.x < x - w || node.position.x > x + w ||
            node.position.z < z - h || node.position.z > z + h
        ) return false;
        if (this.points.length < this.capacity) {
            this.points.push(node);
            return true;
        }
        if (!this.divided) this.subdivide();
        return (
            this.nw.insert(node) || this.ne.insert(node) ||
            this.sw.insert(node) || this.se.insert(node)
        );
    }
    query(range, found = []) {
        const { x, z, w, h } = this.boundary;
        if (
            range.x + range.w < x - w || range.x - range.w > x + w ||
            range.z + range.h < z - h || range.z - range.h > z + h
        ) return found;
        for (const p of this.points) {
            if (
                p.position.x >= range.x - range.w && p.position.x <= range.x + range.w &&
                p.position.z >= range.z - range.h && p.position.z <= range.z + range.h
            ) found.push(p);
        }
        if (this.divided) {
            this.nw.query(range, found);
            this.ne.query(range, found);
            this.sw.query(range, found);
            this.se.query(range, found);
        }
        return found;
    }
}

export { Quadtree };